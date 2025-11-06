
export function getCookie(name: string) {
    return document.cookie
        .split("; ")
        .find(p => p.startsWith(name + "="))
        ?.split("=")[1];
}