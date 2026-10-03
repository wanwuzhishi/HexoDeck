import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('hexodeck', { version: '0.1.0' })
