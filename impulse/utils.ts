/*
* Pokemon Showdown
* Utilities
* @license MIT
*/

// Usage Impulse.serverName
Impulse.serverName = 'Impulse';

// Usage: Impulse.nameColor("username", true, true, room);
function nameColor(name: string, bold: boolean = false, userGroup: boolean = false, room: Room | null = null): string {
  const userId = toID(name);
  let userGroupSymbol = Users.globalAuth.get(userId) ? `<font color=#948A88>${Users.globalAuth.get(userId)}</font>` : "";
  const userName = Users.getExact(name) ? Chat.escapeHTML(Users.getExact(name).name) : Chat.escapeHTML(name);
  return (userGroup ? userGroupSymbol : "") + (bold ? "<b>" : "") + `<font color=${Impulse.hashColor(name)}>${userName}</font>` + (bold ? "</b>" : "");
}

Impulse.nameColor = nameColor;

// Usage Impulse.generateRandomString(10);
function generateRandomString(length: number): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

Impulse.generateRandomString = generateRandomString;
