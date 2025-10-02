/*
* Pokemon Showdown
* Custom Avatars
* @license MIT
*/

import { FS } from '../lib';
import { MongoDB } from '../impulse/mongodb_module';

const AVATAR_PATH = 'config/avatars/';
const STAFF_ROOM_ID = 'staff';
const VALID_EXTENSIONS = ['.jpg', '.png', '.gif'];

interface AvatarDocument {
  _id: string; // userid
  filename: string;
  url: string;
  setBy: string;
  setAt: Date;
  lastUpdated: Date;
}

// Get typed MongoDB collection
const AvatarDB = MongoDB<AvatarDocument>('customavatars');

async function downloadImage(imageUrl: string, name: string, extension: string): Promise<void> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      throw new Error('Not an image file');
    }
    
    const buffer = await response.arrayBuffer();
    await FS(AVATAR_PATH + name + extension).write(Buffer.from(buffer));
  } catch (err) {
    console.error('Error downloading avatar:', err);
    throw err;
  }
}

function getExtension(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return ext || '';
}

/*async function syncAvatarsFromDisk(): Promise<void> {
  try {
    const files = await FS(AVATAR_PATH).readdir();
    if (!files) return;
    
    const validFiles = files.filter(file => VALID_EXTENSIONS.includes(getExtension(file)));
    
    for (const file of validFiles) {
      const ext = getExtension(file);
      const name = file.slice(0, -ext.length);
      
      // Check if already in database
      const exists = await AvatarDB.exists({ _id: name });
      if (!exists) {
        // Add to database (metadata only, image is already on disk)
        await AvatarDB.insertOne({
          _id: name,
          filename: file,
          url: '',
          setBy: 'System',
          setAt: new Date(),
          lastUpdated: new Date(),
        });
      }
    }
    
    console.log(`Synced ${validFiles.length} avatars from config/avatars/ directory`);
  } catch (err) {
    console.error('Error syncing avatars from disk:', err);
  }
}

// Initialize on startup - sync any avatars in the directory
syncAvatarsFromDisk();*/

export const commands: Chat.ChatCommands = {
  customavatar: {
    async set(target, room, user) {
      this.checkCan('bypassall');
      const [name, avatarUrl] = target.split(',').map(s => s.trim());
      if (!name || !avatarUrl) return this.parse('/help customavatar');
      
      const userId = toID(name);
      const processedUrl = /^https?:\/\//i.test(avatarUrl) ? avatarUrl : `http://${avatarUrl}`;
      const ext = getExtension(processedUrl);
      
      if (!VALID_EXTENSIONS.includes(ext)) {
        return this.errorReply('Image must have .jpg, .png, or .gif extension.');
      }
      
      const filename = userId + ext;
      
      try {
        // Download image to config/avatars/ directory
        await downloadImage(processedUrl, userId, ext);
        
        // Save metadata to MongoDB (not the image itself)
        await AvatarDB.upsert(
          { _id: userId },
          {
            filename: filename,
            url: processedUrl,
            setBy: user.name,
            setAt: new Date(),
            lastUpdated: new Date(),
          }
        );
        
        this.sendReply(`|raw|${name}'s avatar was successfully set. Avatar:<p><img src='${processedUrl}' width='80' height='80'></p>`);
        
        const targetUser = Users.get(userId);
        if (targetUser) {
          targetUser.popup(`|html|${Impulse.nameColor(user.name, true, true)} set your custom avatar.<p><img src='${processedUrl}' width='80' height='80'></p><p>Check PM for instructions!</p>`);
        }
        
        this.parse(`/personalavatar ${userId},${filename}`);
        
        let staffRoom = Rooms.get(STAFF_ROOM_ID);
        if (staffRoom) {
          let buf = ``;
          buf += `|html|<div class="infobox"><center><strong>${Impulse.nameColor(user.name, true, true)} set custom avatar for ${Impulse.nameColor(userId, true, false)}:</strong><br>`;
          buf += `<img src='${processedUrl}' width='80' height='80'></center></div>`;
          staffRoom.add(buf).update();
        }
        
        this.modlog('SETAVATAR', null, userId);
      } catch (err) {
        return this.errorReply(`Failed to download avatar: ${err.message}`);
      }
    },
    
    async delete(target, room, user) {
      this.checkCan('bypassall');
      const userId = toID(target);
      
      // Check if avatar exists in database
      const avatarDoc = await AvatarDB.findById(userId);
      if (!avatarDoc) {
        return this.errorReply(`${target} does not have a custom avatar.`);
      }
      
      try {
        // Delete file from config/avatars/ directory
        await FS(AVATAR_PATH + avatarDoc.filename).unlinkIfExists();
        
        // Delete metadata from MongoDB
        await AvatarDB.deleteOne({ _id: userId });
        
        const targetUser = Users.get(userId);
        if (targetUser) {
          targetUser.popup(`|html|${Impulse.nameColor(this.user.name, true, true)} has deleted your custom avatar.`);
        }
        
        this.sendReply(`${target}'s avatar has been removed.`);
        
        let staffRoom = Rooms.get(STAFF_ROOM_ID);
        if (staffRoom) {
          let buf = ``;
          buf += `|html|<div class="infobox"><strong>${Impulse.nameColor(this.user.name, true, true)} deleted custom avatar for ${Impulse.nameColor(userId, true, false)}.</strong></div>`;
          staffRoom.add(buf).update();
        }
        
        this.parse(`/removeavatar ${userId}`);
        this.modlog('DELETEAVATAR', null, userId);
      } catch (err) {
        console.error('Error deleting avatar:', err);
        return this.errorReply('Failed to delete avatar.');
      }
    },
    
    async list(target, room, user) {
      if (!this.runBroadcast()) return;
      
      const avatars = await AvatarDB.findSorted({}, { setAt: -1 });
      
      if (avatars.length === 0) {
        return this.sendReplyBox('No custom avatars found.');
      }
      
      let buf = ``;
      buf += `<b>Custom Avatars (${avatars.length} total):</b><br>`;
      buf += `<div style="max-height: 300px; overflow-y: auto;">`;
      
      for (const avatar of avatars) {
        buf += `<div style="margin: 10px 0;">`;
        buf += `<strong>${Impulse.nameColor(avatar._id, true, true)}</strong> - `;
        buf += `<a href="/avatars/${avatar.filename}" target="_blank">${avatar.filename}</a>`;
        if (avatar.setBy !== 'System') {
          buf += ` (Set by: ${Impulse.nameColor(avatar.setBy, true, true)})`;
        }
        buf += `</div>`;
      }
      
      buf += `</div>`;
      this.sendReplyBox(buf);
    },
    
    async info(target, room, user) {
      if (!target) return this.errorReply('Usage: /customavatar info [username]');
      
      const userId = toID(target);
      const avatarDoc = await AvatarDB.findById(userId);
      
      if (!avatarDoc) {
        return this.errorReply(`${target} does not have a custom avatar.`);
      }
      
      let buf = ``;
      buf += `<b>Avatar Info for ${Impulse.nameColor(userId, true, true)}:</b><br>`;
      buf += `<img src="/avatars/${avatarDoc.filename}" width="80" height="80"><br>`;
      buf += `<b>Filename:</b> ${avatarDoc.filename}<br>`;
      buf += `<b>Stored in:</b> config/avatars/${avatarDoc.filename}<br>`;
      if (avatarDoc.url) {
        buf += `<b>Original URL:</b> <a href="${avatarDoc.url}" target="_blank">${avatarDoc.url}</a><br>`;
      }
      buf += `<b>Set by:</b> ${Impulse.nameColor(avatarDoc.setBy, true, true)}<br>`;
      buf += `<b>Set on:</b> ${avatarDoc.setAt.toUTCString()}<br>`;
      this.sendReplyBox(buf);
    },
    
    async count(target, room, user) {
      const count = await AvatarDB.count({});
      this.sendReply(`There are currently ${count} custom avatar(s).`);
    },
    
    async sync(target, room, user) {
      this.checkCan('bypassall');
      
      await syncAvatarsFromDisk();
      this.sendReply('Avatars synced from config/avatars/ directory to database.');
      this.modlog('SYNCAVATARS', null, 'synced from disk');
    },
    
    async search(target, room, user) {
      if (!target) return this.errorReply('Usage: /customavatar search [query]');
      
      const query = target.toLowerCase();
      const allAvatars = await AvatarDB.find({});
      const results = allAvatars.filter(a => 
        a._id.toLowerCase().includes(query) || 
        a.setBy.toLowerCase().includes(query)
      );
      
      if (results.length === 0) {
        return this.sendReply(`No avatars found matching "${target}".`);
      }
      
      let buf = ``;
      buf += `<b>Avatars matching "${Chat.escapeHTML(target)}" (${results.length} found):</b><br>`;
      
      for (const avatar of results.slice(0, 20)) {
        buf += `${Impulse.nameColor(avatar._id, true, true)}, `;
      }
      
      if (results.length > 20) {
        buf += `<br><em>...and ${results.length - 20} more</em>`;
      }
      
      this.sendReplyBox(buf);
    },
    
    async cleanup(target, room, user) {
      this.checkCan('bypassall');
      
      // Find avatars in database that don't have files on disk
      const avatarDocs = await AvatarDB.find({});
      let cleaned = 0;
      
      for (const doc of avatarDocs) {
        try {
          const exists = await FS(AVATAR_PATH + doc.filename).exists();
          if (!exists) {
            await AvatarDB.deleteOne({ _id: doc._id });
            cleaned++;
          }
        } catch (err) {
          console.error(`Error checking ${doc.filename}:`, err);
        }
      }
      
      this.sendReply(`Cleaned up ${cleaned} orphaned database entries.`);
      this.modlog('CLEANUPAVATARS', null, `${cleaned} entries`);
    },
    
    async restore(target, room, user) {
      this.checkCan('bypassall');
      
      if (target) {
        // Restore a specific user's avatar
        const userId = toID(target);
        const avatarDoc = await AvatarDB.findById(userId);
        
        if (!avatarDoc) {
          return this.errorReply(`${target} does not have an avatar in the database.`);
        }
        
        const fileExists = await FS(AVATAR_PATH + avatarDoc.filename).exists();
        if (fileExists) {
          return this.errorReply(`${target}'s avatar file already exists.`);
        }
        
        if (!avatarDoc.url) {
          return this.errorReply(`${target}'s avatar has no original URL to restore from.`);
        }
        
        try {
          const ext = getExtension(avatarDoc.filename);
          await downloadImage(avatarDoc.url, userId, ext);
          this.sendReply(`Successfully restored ${target}'s avatar from URL.`);
          this.modlog('RESTOREAVATAR', null, userId);
        } catch (err) {
          return this.errorReply(`Failed to restore avatar: ${err.message}`);
        }
      } else {
        // Restore all missing avatars that have URLs
        const avatarDocs = await AvatarDB.find({});
        let restored = 0;
        let failed = 0;
        let skipped = 0;
        
        for (const doc of avatarDocs) {
          try {
            const fileExists = await FS(AVATAR_PATH + doc.filename).exists();
            if (fileExists) {
              skipped++;
              continue;
            }
            
            if (!doc.url) {
              skipped++;
              continue;
            }
            
            const ext = getExtension(doc.filename);
            await downloadImage(doc.url, doc._id, ext);
            restored++;
          } catch (err) {
            console.error(`Failed to restore ${doc._id}:`, err);
            failed++;
          }
        }
        
        let buf = ``;
        buf += `Avatar restoration complete:<br>`;
        buf += `- Restored: ${restored}<br>`;
        buf += `- Failed: ${failed}<br>`;
        buf += `- Skipped (already exists or no URL): ${skipped}`;
        this.sendReplyBox(buf);
        this.modlog('RESTOREAVATARS', null, `${restored} restored, ${failed} failed`);
      }
    },
  
    customavatarhelp(target, room, user) {
      if (!this.runBroadcast()) return;
      let buf = ``;
      buf += `<p><strong>Custom Avatar Commands</strong></p>`;
      buf += `<ul>`;
      buf += `<li><code>/customavatar set [username], [image url]</code> - Downloads and sets a user's avatar to config/avatars/ (Requires: ~)</li>`;
      buf += `<li><code>/customavatar delete [username]</code> - Removes a user's avatar from config/avatars/ (Requires: ~)</li>`;
      buf += `<li><code>/customavatar list</code> - Lists all custom avatars</li>`;
      buf += `<li><code>/customavatar info [username]</code> - Shows detailed info about a user's avatar</li>`;
      buf += `<li><code>/customavatar search [query]</code> - Search for avatars by username or setter</li>`;
      buf += `<li><code>/customavatar count</code> - Shows total number of custom avatars</li>`;
      buf += `<li><code>/customavatar sync</code> - Sync avatars from config/avatars/ directory to database (Requires: ~)</li>`;
      buf += `<li><code>/customavatar cleanup</code> - Remove database entries for missing avatar files (Requires: ~)</li>`;
      buf += `</ul>`;
      buf += `<p><strong>Note:</strong> Avatar images are stored in config/avatars/ directory. MongoDB only stores metadata (filename, URL, setter info).</p>`;
      this.sendReplyBox(buf);
    },
  },
};
