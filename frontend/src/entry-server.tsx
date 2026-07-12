// @refresh reload
import {createHandler, StartServer} from "@solidjs/start/server";

export default createHandler(() => (
    <StartServer
        document={({assets, children, scripts}) => (
            <html lang="en">
            <head>
                <meta charset="utf-8"/>
                <meta name="viewport" content="width=device-width, initial-scale=1"/>
                <link rel="icon" href="/favicon.ico"/>
                <link rel="icon" type="image/svg+xml" href="/brico-face.svg" />
                <meta name="theme-color" content="#15557d" />
                <meta property="og:type" content="website"/>
                <meta property="og:site_name" content="Brico.app" />
                <meta property="twitter:domain" content="brico.app"/>
                <link rel="search" type="application/opensearchdescription+xml" title="Brico.app" href="/opensearch.xml"/>
                {assets}
            </head>
            <body>
            <div id="app">{children}</div>
            {scripts}
            </body>
            </html>
        )}
    />
));
