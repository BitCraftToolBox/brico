Brico's Toolbox
===============

> If I had had more time, I would have written less code.

Brico's Toolbox is a website companion for the social sandbox MMORPG [BitCraft](https://bitcraftonline.com).
It aims to be a comprehensive compendium of game items, recipes, etc. that supplements the in-game compendium
with additional data from game files.

If you're a BitCraft player who just wants to use the site, it's at https://brico.app.

You can join the discord server at https://discord.gg/MJGD2hZDGv.

If you're also a developer interested in contributing, contributions are appreciated (especially if you know more
about TypeScript/SolidJS than I do).

At the moment, the site is entirely a client-side SPA written with [SolidJS](https://solidjs.com) making heavy
use of [SolidUI](https://www.solid-ui.com) and its constituent backend component libraries,
[Kobalte](https://kobalte.dev) and [corvu](https://corvu.dev/). As someone nearly entirely new to JS/TS and
frontend web frameworks, these have been instrumental in allowing me to release the first version of the site
in under two weeks.

If you're interested in making your own BitCraft-related tools:

The data comes from the `desc`ription tables in the game's [SpacetimeDB](https://spacetimedb.com) server/database.
More information on the data and bindings used to read them can be found in the other repositories of
[this org](https://github.com/BitCraftToolBox) or the [BitCraft Datamining Discord](https://discord.gg/DzWmy6UrRm).

Eventually, some backend features might be added, especially concerning getting data from the live servers,
though this is low on the priority list as I'd like to capture as much as the static data as possible first.

Brico's Toolbox is released under the [AGPL v3](LICENSE.txt).
