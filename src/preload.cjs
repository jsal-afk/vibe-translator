const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['state', 'show-login', 'translate', 'cancel', 'clipboard-read', 'clipboard-write', 'preferences', 'logout', 'open-source', 'ensure-ready']);
contextBridge.exposeInMainWorld('luna', {
  invoke: (channel, value) => { if (!channels.has(channel)) throw new Error('Unknown channel'); return ipcRenderer.invoke(channel, value); },
  on: (channel, callback) => {
    if (!['connection-state', 'translation-progress', 'clipboard-import'].includes(channel)) throw new Error('Unknown event');
    const listener = (_event, value) => callback(value); ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
