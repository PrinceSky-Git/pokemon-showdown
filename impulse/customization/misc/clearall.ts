/*
 * clearall & globalclearall commands
 */

/**
 * Clears the server-side log for a list of rooms and forces a client-side
 * refresh for all users by making them leave and rejoin the room.
 */
function clearRoomLogAndRefreshClients(rooms: Room[]): void {
  for (const room of rooms) {
    if (!room) continue;
    // 1. Clear the server's log for the room.
		room.log.log.length = 0;
    // 2. Force all users to leave and rejoin to clear their client's view.
    const usersInRoom = Object.values(room.users);
		for (const user of usersInRoom) {
			user.leaveRoom(room);
		}
    // 3. After a short delay, have them rejoin.
		setTimeout(() => {
			for (const user of usersInRoom) {
				user.joinRoom(room);
			}
		}, 1000);
	}
}

export const commands: Chat.ChatCommands = {
	clearall: {
		''(target, room, user) {
			// Command guards
			if (!room) return this.errorReply("This command can only be used in a room.");
			if (room.battle) return this.errorReply("You cannot use /clearall in battle rooms.");
			this.checkCan('roommod', null, room);

			clearRoomLogAndRefreshClients([room]);
		},
    
		help: `Clears all messages from the current chatroom. Requires: #, ~, &`,
	},

	globalclearall: {
		''(target, room, user) {
			this.checkCan('globalban');

			const roomsToClear = Rooms.global.chatRooms.filter(
				(chatRoom): chatRoom is Room => !!chatRoom && !chatRoom.battle
			);

			clearRoomLogAndRefreshClients(roomsToClear);
		},
    
		help: `Clears all messages from all chatrooms. Requires: &, ~`,
	},
};
