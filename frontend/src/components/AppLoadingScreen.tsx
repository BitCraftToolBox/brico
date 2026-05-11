import {Component} from "solid-js";

interface AppLoadingScreenProps {
    loaded: number;
    total: number;
}

const AppLoadingScreen: Component<AppLoadingScreenProps> = (props) => {
    const percent = () => props.total > 0 ? Math.round((props.loaded / props.total) * 100) : 0;

    return (
        <div class="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background">
            <img src="/brico.webp" alt="Brico" class="h-16 w-16 rounded-xl"/>
            <div class="flex flex-col items-center gap-2">
                <p class="text-lg font-semibold tracking-wide">Brico's Toolbox</p>
                <p class="text-sm text-muted-foreground">
                    Loading game data… {props.loaded}/{props.total}
                </p>
            </div>
            <div class="w-64 overflow-hidden rounded-full bg-muted h-2">
                <div
                    class="h-full rounded-full bg-primary transition-all duration-200"
                    style={{width: `${percent()}%`}}
                />
            </div>
        </div>
    );
};

export default AppLoadingScreen;

