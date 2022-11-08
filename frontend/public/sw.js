self.addEventListener('push', (e) => {
    const data = e.data.json();

    self.registration.showNotification(data.type + ' - ' + data.title, {
        body: data.body,
        icon: data.icon,
        tag: data.id,
        data: `/history/${data.course}${data.section ? '-' + data.section : ''}?semester=${data.semester}/`
    });
});

self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    clients.openWindow(e.notification.data);
})
