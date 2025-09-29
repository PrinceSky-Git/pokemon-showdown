/*
* Pokemon Showdown
* Custom Icons
* @license MIT
*/

import { FS } from '../../lib';

// Change this to match your server's userlist color.
const backgroundColor = 'rgba(248, 187, 217, 0.3)';
const STAFF_ROOM_ID = 'staff';
const DEFAULT_ICON_SIZE = 30;

interface IconData {
  url: string;
  size?: number;
}

interface Icons {
  [userid: string]: IconData | string;
}

async function updateIcons(): Promise<void> {
  try {
    const icons: Icons = await DB.usericons.get() || {};
    
    let newCss = '/* ICONS START */\n';
    for (const name in icons) {
      const iconData = icons[name];
      let url: string;
      let size: number;
      
      if (typeof iconData === 'string') {
        // Legacy format - just a URL string
        url = iconData;
        size = DEFAULT_ICON_SIZE;
      } else {
        // New format - object with url and size
        url = iconData.url;
        size = iconData.size || DEFAULT_ICON_SIZE;
      }
      
      newCss += `[id$="-userlist-user-${toID(name)}"] { background: ${backgroundColor} url("${url}") right no-repeat !important; background-size: ${size}px!important;}\n`;
    }
    newCss += '/* ICONS END */\n';
    
    const file = FS('config/custom.css').readIfExistsSync().split('\n');
    const start = file.indexOf('/* ICONS START */');
    const end = file.indexOf('/* ICONS END */');
    if (start !== -1 && end !== -1) {
      file.splice(start, (end - start) + 1);
    }
    await FS('config/custom.css').writeUpdate(() => file.join('\n') + newCss);
    Impulse.reloadCSS();
  } catch (err) {
    console.error('Error updating icons:', err);
  }
}

export const commands: Chat.ChatCommands = {
  usericon: 'icon',
  icon: {
	  ''(target, room, user) {
		  this.parse(`/iconhelp`);
	  },
	  
    async set(target, room, user) {
      this.checkCan('globalban');
      const parts = target.split(',').map(s => s.trim());
      const [name, imageUrl, sizeStr] = parts;
      
      if (!name || !imageUrl) return this.parse('/help icon');
      
      const userId = toID(name);
      if (userId.length > 19) return this.errorReply('Usernames are not this long...');
      if (await DB.usericons.has(userId)) return this.errorReply('This user already has an icon. Remove it first with /icon delete [user].');
      
      // Parse size parameter
      let size = DEFAULT_ICON_SIZE;
      if (sizeStr) {
        const parsedSize = parseInt(sizeStr);
        if (isNaN(parsedSize) || parsedSize < 1 || parsedSize > 100) {
          return this.errorReply('Invalid size. Please use a number between 1 and 100 pixels.');
        }
        size = parsedSize;
      }
      
      const iconData: IconData = { url: imageUrl, size };
      await DB.usericons.insert(userId, iconData);
      await updateIcons();
      
      const sizeDisplay = size !== DEFAULT_ICON_SIZE ? ` (${size}px)` : '';
      this.sendReply(`|raw|You have given ${Impulse.nameColor(name, true, false)} an icon${sizeDisplay}.`);
      
      const targetUser = Users.get(userId);
      if (targetUser?.connected) {
        targetUser.popup(`|html|${Impulse.nameColor(user.name, true, true)} has set your userlist icon to: <img src="${imageUrl}" width="32" height="32">${sizeDisplay}<br /><center>Refresh, If you don't see it.</center>`);
      }
      
      const staffRoom = Rooms.get(STAFF_ROOM_ID);
      if (staffRoom) {
        staffRoom.add(`|html|<div class="infobox"> ${Impulse.nameColor(user.name, true, true)} set icon for ${Impulse.nameColor(name, true, false)}: <img src="${imageUrl}" width="32" height="32">${sizeDisplay}</div>`).update();
      }
    },
    
    async delete(target, room, user) {
      this.checkCan('globalban');
      const userId = toID(target);
      if (!await DB.usericons.has(userId)) return this.errorReply(`${target} does not have an icon.`);
      
      await DB.usericons.remove(userId);
      await updateIcons();
      this.sendReply(`You removed ${target}'s icon.`);
      
      const targetUser = Users.get(userId);
      if (targetUser?.connected) {
        targetUser.popup(`|html|${Impulse.nameColor(user.name, true, true)} has removed your userlist icon.`);
      }
      
      const staffRoom = Rooms.get(STAFF_ROOM_ID);
      if (staffRoom) {
        staffRoom.add(`|html|<div class="infobox">${Impulse.nameColor(user.name, true, true)} removed icon for ${Impulse.nameColor(target, true, false)}.</div>`).update();
      }
    },
  },
  
  iconhelp(target, room, user) {
    if (!this.runBroadcast()) return;
    this.sendReplyBox(
      `<div><b><center>Custom Icon Commands</center></b><br>` +
      `<ul>` +
      `<li><code>/icon set [username], [image url], [size in px]</code> - Gives [user] an icon with optional size (default: 22px, max: 100px) (Requires: @ and higher)</li><br>` +
      `<li><code>/icon delete [username]</code> - Removes a user's icon (Requires: @ and higher)</li>` +
      `</ul></div>`
    );
  },
};
