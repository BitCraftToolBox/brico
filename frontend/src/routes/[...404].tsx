import MainLayout from "~/components/MainLayout";

export default function NotFound() {
    return (
        <MainLayout title={"Not Found"} ownHeading description="Page not found on Brico.app, the BitCraft online compendium." wrapperClasses={"text-center mx-auto mt-25% p-4"}>
            <h1 class="max-6-xs text-6xl text-secondary-foreground font-thin uppercase">404</h1>
        </MainLayout>
    );
}
