/// <reference no-default-lib="true"/>
/// <reference lib="es2020" />
/// <reference lib="WebWorker" />

// @ts-ignore
self.addEventListener('push', (e) => {
    // @ts-ignore
    const data = e.data.json();
    // @ts-ignore
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
    });
});
