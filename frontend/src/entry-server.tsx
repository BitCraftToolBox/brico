// @refresh reload
import {createHandler, StartServer} from "@solidjs/start/server";
import {PSEUDOLOCALE_ENABLED} from "~/lib/i18n";
import {KEYS} from "~/lib/settings";

const preHydrationScript = `!function(){try{var t=localStorage.getItem("${KEYS.theme}");if(t&&t.charAt(0)==='"'){var p=JSON.parse(t);if(typeof p==="string")localStorage.setItem("${KEYS.theme}",p)}}catch(e){}try{var v=localStorage.getItem("${KEYS.midnightDark}");if(JSON.parse(v||"false"))document.documentElement.setAttribute("data-midnight-dark","")}catch(e){}}();`;

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
                <script id="pre-hydration-script" innerHTML={preHydrationScript}/>
                {PSEUDOLOCALE_ENABLED && (
                    <>
                        <script type="text/javascript">{`
                            var _jipt = [];
                            _jipt.push(['project', 'brico']);
                            _jipt.push(['preload_texts', true]);
                        `}</script>
                        <script type="text/javascript" src="//cdn.crowdin.com/jipt/jipt.js"></script>
                    </>
                )}
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
