// @refresh reload
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
      <head>
          <meta charset="utf-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1"/>
          <link rel="icon" href="/favicon.ico"/>
          <meta name="description" content="The BitCraft online compendium and companion app"/>
          <meta property="og:url" content="https://brico.app"/>
          <meta property="og:type" content="website"/>
          <meta property="og:title" content="Brico's Toolbox"/>
          <meta property="og:description" content="The BitCraft online compendium and companion app"/>
          <meta property="og:image" content="/brico.png"/>
          <meta name="twitter:card" content="summary_large_image"/>
          <meta property="twitter:domain" content="brico.app"/>
          <meta property="twitter:url" content="https://brico.app"/>
          <meta name="twitter:title" content="Brico's Toolbox"/>
          <meta name="twitter:description" content="The BitCraft online compendium and companion app"/>
          <meta name="twitter:image" content="/brico.png"/>
          {assets}
      </head>
      <body>
      <div id="app">{children}</div>
      <div id="kobalte">{children}</div>
      {scripts}
      </body>
      </html>
    )}
  />
));
