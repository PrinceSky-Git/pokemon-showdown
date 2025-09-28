/*
* Pokemon Showdown
* Custom Avatars
* @license MIT
*/

import { FS } from '../../lib';

const AVATAR_PATH = 'config/avatars/';
const STAFF_ROOM_ID = 'staff';
const VALID_EXTENSIONS = ['.jpg', '.png', '.gif'];

interface AvatarRequestData {
  [userid: string]: boolean;
}

interface PendingRequestData {
  [userid: string]: string;
}

async function downloadImage(imageUrl: string, name: string, extension: string): Promise<void> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return;

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) return;
    
    const buffer = await response.arrayBuffer();
    await FS(AVATAR_PATH + name + extension).write(Buffer.from(buffer));
  } catch (err) {
    console.error('Error downloading avatar:', err);
  }
}

function getExtension(filename: string): string {
  const ext = filename.slice(filename.lastIndexOf('.'));
  return ext || '';
}

async function initializeAvatars(): Promise<void> {
  try {
    const files = await FS(AVATAR_PATH).readdir();
    if (!files) return;
    files
      .filter(file => VALID_EXTENSIONS.includes(getExtension(file)))
      .forEach(file => {
        const ext = getExtension(file);
        const name = file.slice(0, -ext.length);
        Config.customavatars = Config.customavatars || {};
        Config.customavatars[name] = file;
      });
  } catch (err) {
    console.log('Error loading avatars:', err);
  }
}

initializeAvatars();

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
      Config.customavatars = Config.customavatars || {};
      Config.customavatars[userId] = userId + ext;
      await downloadImage(processedUrl, userId, ext);
      this.sendReply(`|raw|${name}'s avatar was successfully set. Avatar:<p><img src='${processedUrl}' width='80' height='80'></p>`);
      
      const targetUser = Users.get(userId);
      if (targetUser) {
        targetUser.popup(`|html|${Impulse.nameColor(user.name, true, true)} set your custom avatar.<p><img src='${processedUrl}' width='80' height='80'></p><p>Check PM for instructions!</p>`);
      }
      this.parse(`/personalavatar ${userId},${Config.customavatars[userId]}`);
      
      let staffRoom = Rooms.get(STAFF_ROOM_ID);
      if (staffRoom) {
        staffRoom.add(`|html|<div class="infobox"><center><strong>${Impulse.nameColor(user.name, true, true)} set custom avatar for ${Impulse.nameColor(userId, true, false)}:</strong><br><img src='${processedUrl}' width='80' height='80'></center></div>`).update();
      }
    },
    
    async delete(target, room, user) {
      this.checkCan('bypassall');
      const userId = toID(target);
      const image = Config.customavatars?.[userId];
      if (!image) {
        return this.errorReply(`${target} does not have a custom avatar.`);
      }
      if (Config.customavatars) delete Config.customavatars[userId];
      try {
        await FS(AVATAR_PATH + image).unlinkIfExists();
        
        const targetUser = Users.get(userId);
        if (targetUser) {
          targetUser.popup(`|html|${Impulse.nameColor(this.user.name, true, true)} has deleted your custom avatar.`);
        }
        this.sendReply(`${target}'s avatar has been removed.`);
        
        let staffRoom = Rooms.get(STAFF_ROOM_ID);
        if (staffRoom) {
          staffRoom.add(`|html|<div class="infobox"><strong>${Impulse.nameColor(this.user.name, true, true)} deleted custom avatar for ${Impulse.nameColor(userId, true, false)}.</strong></div>`).update(); 
        }
        this.parse(`/removeavatar ${userId}`);
      } catch (err) {
        console.error('Error deleting avatar:', err);
      }
    },
  
    customavatarhelp(target, room, user) {
      if (!this.runBroadcast()) return;
      this.sendReplyBox(
        `<p><strong>Custom Avatar Commands</strong></p>` +
        `<ul>` +
        `<li><code>/customavatar set [username], [image url]</code> - Sets a user's avatar (Requires: ~)</li>` +
        `<li><code>/customavatar delete [username]</code> - Removes a user's avatar (Requires: ~)</li>` +
        `</ul>`
      );
    },
  },
};
