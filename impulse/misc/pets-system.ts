export const pages: Chat.PageTable = {
  async petgallery(args, user) {
    // List all Pokémon names — in practice, fetch or import this from your data source
    const pokemons = [
      "bulbasaur", "ivysaur", "venusaur",
      "charmander", "charmeleon", "charizard",
      // Add more Pokémon names as needed
    ];

    if (!pokemons.length) {
      return `<div class="pad"><h2>No Pokémon data available.</h2></div>`;
    }

    // Build HTML for all Pokémon images in square blocks with styling
    const blocksHTML = pokemons.map(name => {
      // Pokemon Showdown sprite URL format for animated GIF
      const url = `https://play.pokemonshowdown.com/sprites/ani/${name}.gif`;
      return `
        <div style="display:inline-block; width: 100px; height: 100px; margin: 5px; text-align: center; vertical-align: top; border: 1px solid #ccc; border-radius: 8px; background: #fafafa;">
          <img src="${url}" alt="${name}" title="${name}" style="max-width: 80px; max-height: 80px; margin-top: 10px;">
          <div style="font-size: 12px; margin-top: 5px;">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
        </div>`;
    }).join('');

    return `<div style="text-align: center;"><h2>Pokémon Pets Gallery</h2>${blocksHTML}</div>`;
  },
};

export const commands: Chat.ChatCommands = {
  pets(target, room, user) {
    if (!this.runBroadcast()) return;
    return this.parse(`/join view-petgallery`);
  },
};
