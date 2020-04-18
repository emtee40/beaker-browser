import { app, BrowserWindow, dialog, Menu } from 'electron'
import { createShellWindow, toggleShellInterface, getActiveWindow, getFocusedDevToolsHost, getAddedWindowSettings } from './windows'
import { runNewDriveFlow, runNewDriveFromFolderFlow, runForkFlow, runCloneFlow, runDrivePropertiesFlow } from './util'
import * as tabManager from './tab-manager'
import * as viewZoom from './tabs/zoom'
import { download } from './downloads'
import hyper from '../hyper/index'

// globals
// =

var currentMenuTemplate

// exported APIs
// =

export function setup () {
  setApplicationMenu({ noWindows: true })

  // watch for changes to the currently active window
  app.on('browser-window-focus', async (e, win) => {
    try {
      const url = tabManager.getActive(win).url
      setApplicationMenu({url})
    } catch (e) {
      // `pages` not set yet
    }
  })

  // watch for all windows to be closed
  app.on('custom-window-all-closed', () => {
    setApplicationMenu({ noWindows: true })
  })

  // watch for any window to be opened
  app.on('browser-window-created', () => {
    setApplicationMenu()
  })
}

export function onSetCurrentLocation (win, url) {
  // check if this is the currently focused window
  if (!url || win !== BrowserWindow.getFocusedWindow()) {
    return
  }

  // rebuild as needed
  if (requiresRebuild(url)) {
    setApplicationMenu({url})
  }
}

export function setApplicationMenu (opts = {}) {
  currentMenuTemplate = buildWindowMenu(opts)
  Menu.setApplicationMenu(Menu.buildFromTemplate(currentMenuTemplate))
}

export function buildWindowMenu (opts = {}) {
  const isDriveSite = opts.url && opts.url.startsWith('hyper://')
  const noWindows = opts.noWindows === true
  const getWin = () => BrowserWindow.getFocusedWindow()
  const addedWindowSettings = getAddedWindowSettings(getActiveWindow())
  const isAppWindow = addedWindowSettings.isAppWindow

  var darwinMenu = {
    label: 'Beaker',
    submenu: [
      {
        label: 'Preferences',
        accelerator: 'Cmd+,',
        click (item) {
          var win = getWin()
          if (win) tabManager.create(win, 'beaker://settings', {setActive: true})
          else createShellWindow({ pages: ['beaker://settings'] })
        }
      },
      { type: 'separator' },
      { label: 'Services', role: 'services', submenu: [] },
      { type: 'separator' },
      { label: 'Hide Beaker', accelerator: 'Cmd+H', role: 'hide' },
      { label: 'Hide Others', accelerator: 'Cmd+Alt+H', role: 'hideothers' },
      { label: 'Show All', role: 'unhide' },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'Cmd+Q', click () { app.quit() }, reserved: true }
    ]
  }

  var fileMenu = {
    label: 'File',
    submenu: [
      {
        id: 'newTab',
        label: 'New Tab',
        accelerator: 'CmdOrCtrl+T',
        click: function (item) {
          var win = getWin()
          if (win) {
            tabManager.create(win, undefined, {setActive: true, focusLocationBar: true})
          } else {
            createShellWindow()
          }
        },
        reserved: true
      },
      {
        id: 'newWindow',
        label: 'New Window',
        accelerator: 'CmdOrCtrl+N',
        click: function () { createShellWindow() },
        reserved: true
      },
      {
        id: 'reopenClosedTab',
        label: 'Reopen Closed Tab',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: function (item) {
          var win = getWin()
          createWindowIfNone(win, (win) => {
            tabManager.reopenLastRemoved(win)
          })
        },
        reserved: true
      },
      { type: 'separator' },
      {
        id: 'savePageAs',
        label: 'Save Page As...',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'CmdOrCtrl+S',
        click: async (item) => {
          var win = getWin()
          var tab = tabManager.getActive(win)
          if (!tab) return
          const url = tab.url
          const title = tab.title
          var {filePath} = await dialog.showSaveDialog({ title: `Save ${title} as...`, defaultPath: app.getPath('downloads') })
          if (filePath) download(win, win.webContents, url, { saveAs: filePath, suppressNewDownloadEvent: true })
        }
      },
      {
        id: 'print',
        label: 'Print...',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+P',
        click: (item) => {
          var tab = tabManager.getActive(getWin())
          if (!tab) return
          tab.webContents.print()
        }
      },
      { type: 'separator' },
      {
        id: 'closeTab',
        label: 'Close Tab',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+W',
        click: function (item) {
          var win = getWin()
          if (win) {
            // a regular browser window
            let active = tabManager.getActive(win)
            if (active) {
              if (active.isSidebarActive) {
                active.closeSidebar()
              } else {
                tabManager.remove(win, active)
              }
            }
          } else {
            // devtools
            let wc = getFocusedDevToolsHost()
            if (wc) {
              wc.closeDevTools()
            }
          }
        },
        reserved: true
      },
      {
        id: 'closeWindow',
        label: 'Close Window',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+Shift+W',
        click: function (item) {
          var win = getWin()
          if (win) win.close()
        },
        reserved: true
      }
    ]
  }

  var editMenu = {
    label: 'Edit',
    submenu: [
      { id: 'undo', label: 'Undo', enabled: !noWindows, accelerator: 'CmdOrCtrl+Z', selector: 'undo:', reserved: true },
      { id: 'redo', label: 'Redo', enabled: !noWindows, accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:', reserved: true },
      { type: 'separator' },
      { id: 'cut', label: 'Cut', enabled: !noWindows, accelerator: 'CmdOrCtrl+X', selector: 'cut:', reserved: true },
      { id: 'copy', label: 'Copy', enabled: !noWindows, accelerator: 'CmdOrCtrl+C', selector: 'copy:', reserved: true },
      { id: 'paste', label: 'Paste', enabled: !noWindows, accelerator: 'CmdOrCtrl+V', selector: 'paste:', reserved: true },
      { id: 'selectAll', label: 'Select All', enabled: !noWindows, accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' },
      { type: 'separator' },
      {
        id: 'findInPage',
        label: 'Find in Page',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'CmdOrCtrl+F',
        click: function (item) {
          var tab = tabManager.getActive(getWin())
          if (tab) tab.showInpageFind()
        }
      },
      {
        id: 'findNext',
        label: 'Find Next',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'CmdOrCtrl+G',
        click: function (item) {
          var tab = tabManager.getActive(getWin())
          if (tab) tab.moveInpageFind(1)
        }
      },
      {
        id: 'findPrevious',
        label: 'Find Previous',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'Shift+CmdOrCtrl+G',
        click: function (item) {
          var tab = tabManager.getActive(getWin())
          if (tab) tab.moveInpageFind(-1)
        }
      }
    ]
  }

  var viewMenu = {
    label: 'View',
    submenu: [
      {
        id: 'reload',
        label: 'Reload',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+R',
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) {
              active.webContents.reload()
            }
          }
        },
        reserved: true
      },
      {
        id: 'hardReload',
        label: 'Hard Reload (Clear Cache)',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: function (item) {
          // HACK
          // this is *super* lazy but it works
          // clear all hyper-dns cache on hard reload, to make sure the next
          // load is fresh
          // -prf
          hyper.dns.flushCache()

          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) {
              active.webContents.reloadIgnoringCache()
            }
          }
        },
        reserved: true
      },
      { type: 'separator' },        
      {
        id: 'toggleSiteInfo',
        label: 'Site Information',
        enabled: !noWindows && !isAppWindow,
        click: async function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.executeSidebarCommand('show-panel', 'site-info-app')
          }
        }
      },
      {
        id: 'toggleEditor',
        label: 'Editor',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'CmdOrCtrl+B',
        click: async function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.executeSidebarCommand('show-panel', 'editor-app')
          }
        }
      },
      {
        id: 'toggleFilesExplorer',
        label: 'Files Explorer',
        enabled: !noWindows && !isAppWindow || !!isDriveSite,
        click: async function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.executeSidebarCommand('show-panel', 'files-explorer-app')
          }
        }
      },
      {
        id: 'toggleTerminal',
        label: 'Terminal',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'Ctrl+`',
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.executeSidebarCommand('show-panel', 'web-term')
          }
        }
      },
      {type: 'separator'},
      {
        id: 'zoomIn',
        label: 'Zoom In',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+Plus',
        reserved: true,
        click: function (item) {
          var win = getWin()
          if (win) {
            viewZoom.zoomIn(tabManager.getActive(win))
          }
        }
      },
      {
        id: 'zoomOut',
        label: 'Zoom Out',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+-',
        reserved: true,
        click: function (item) {
          var win = getWin()
          if (win) {
            viewZoom.zoomOut(tabManager.getActive(win))
          }
        }
      },
      {
        id: 'actualSize',
        label: 'Actual Size',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+0',
        click: function (item) {
          var win = getWin()
          if (win) {
            viewZoom.zoomReset(tabManager.getActive(win))
          }
        }
      }
    ]
  }

  var driveMenu = {
    label: 'Drive',
    submenu: [
      {
        id: 'newDrive',
        label: 'New Hyperdrive',
        async click (item) {
          var win = getWin()
          createWindowIfNone(win, async (win) => {
            let newUrl = await runNewDriveFlow(win)
            tabManager.create(win, newUrl, {setActive: true})
          })
        }
      },
      {
        id: 'newDriveFromFolder',
        label: 'New Drive from Folder...',
        async click (item) {
          var win = getWin()
          createWindowIfNone(win, async (win) => {
            var {filePaths} = await dialog.showOpenDialog({title: 'Select folder', buttonLabel: 'Use folder', properties: ['openDirectory'] })
            if (filePaths && filePaths[0]) {
              let newUrl = await runNewDriveFromFolderFlow(filePaths[0])
              tabManager.create(win, newUrl, {setActive: true})
            }
          })
        }
      },
      {type: 'separator'},
      {
        id: 'cloneDrive',
        label: 'Clone Drive',
        enabled: !!isDriveSite,
        async click (item) {
          var win = getWin()
          if (win) {
            let newUrl = await runCloneFlow(win, opts.url)
            tabManager.create(win, newUrl, {setActive: true})
          }
        }
      },
      {
        id: 'forkDrive',
        label: 'Fork Drive',
        enabled: !!isDriveSite,
        async click (item) {
          var win = getWin()
          if (win) {
            let newUrl = await runForkFlow(win, opts.url)
            tabManager.create(win, newUrl, {setActive: true})
          }
        }
      },
      {
        id: 'diffMerge',
        label: 'Diff / Merge',
        enabled: !!isDriveSite,
        async click (item) {
          var win = getWin()
          if (win) tabManager.create(win, `beaker://diff/?base=${opts.url}`, {setActive: true})
        }
      },
      {type: 'separator'},
      {
        id: 'driveProperties',
        label: 'Drive Properties',
        enabled: !!isDriveSite,
        async click (item) {
          var win = getWin()
          if (win) runDrivePropertiesFlow(win, hyper.drives.fromURLToKey(opts.url))
        }
      }
    ]
  }

  var showHistoryAccelerator = 'Ctrl+H'

  if (process.platform === 'darwin') {
    showHistoryAccelerator = 'Cmd+Y'
  }

  var historyMenu = {
    label: 'History',
    role: 'history',
    submenu: [
      {
        id: 'back',
        label: 'Back',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+Left',
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.webContents.goBack()
          }
        }
      },
      {
        id: 'forward',
        label: 'Forward',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+Right',
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.webContents.goForward()
          }
        }
      },
      {
        id: 'showFullHistory',
        label: 'Show Full History',
        accelerator: showHistoryAccelerator,
        click: function (item) {
          var win = getWin()
          if (win) tabManager.create(win, 'beaker://history', {setActive: true})
          else createShellWindow({ pages: ['beaker://history'] })
        }
      },
      { type: 'separator' },
      {
        id: 'bookmarkThisPage',
        label: 'Bookmark this Page',
        enabled: !noWindows,
        accelerator: 'CmdOrCtrl+D',
        click: function (item) {
          var win = getWin()
          if (win) win.webContents.send('command', 'create-bookmark')
        }
      }
    ]
  }

  var developerMenu = {
    label: 'Developer',
    submenu: [
      {
        type: 'submenu',
        label: 'Advanced Tools',
        submenu: [
          {
            label: 'Reload Shell-Window',
            enabled: !noWindows,
            click: function () {
              getWin().webContents.reloadIgnoringCache()
            }
          },
          {
            label: 'Toggle Shell-Window DevTools',
            enabled: !noWindows,
            click: function () {
              getWin().webContents.openDevTools({mode: 'detach'})
            }
          },
          { type: 'separator' },
          {
            label: 'Open Hyperdrives Debug Page',
            enabled: !noWindows,
            click: function (item) {
              var win = getWin()
              if (win) tabManager.create(win, 'beaker://active-drives/', {setActive: true})
            }
          }, {
            label: 'Open Dat-DNS Cache Page',
            enabled: !noWindows,
            click: function (item) {
              var win = getWin()
              if (win) tabManager.create(win, 'beaker://hyper-dns-cache/', {setActive: true})
            }
          }, {
            label: 'Open Debug Log Page',
            enabled: !noWindows,
            click: function (item) {
              var win = getWin()
              if (win) tabManager.create(win, 'beaker://debug-log/', {setActive: true})
            }
          }
        ]
      },
      {
        id: 'toggleDevTools',
        label: 'Toggle DevTools',
        enabled: !noWindows,
        accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+I' : 'Shift+CmdOrCtrl+I',
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.webContents.toggleDevTools()
          }
        },
        reserved: true
      },
      {
        id: 'toggleLiveReloading',
        label: 'Toggle Live Reloading',
        enabled: !!isDriveSite,
        click: function (item) {
          var win = getWin()
          if (win) {
            let active = tabManager.getActive(win)
            if (active) active.toggleLiveReloading()
          }
        }
      }
    ]
  }

  const gotoTabShortcut = index => ({
    label: `Tab ${index}`,
    enabled: !noWindows,
    accelerator: `CmdOrCtrl+${index}`,
    click: function (item) {
      var win = getWin()
      if (win) tabManager.setActive(win, index - 1)
    }
  })
  var windowMenu = {
    label: 'Window',
    role: 'window',
    submenu: [
      {
        type: 'checkbox',
        label: 'Always on Top',
        checked: (getWin() ? getWin().isAlwaysOnTop() : false),
        click: function () {
          var win = getWin()
          if (!win) return
          win.setAlwaysOnTop(!win.isAlwaysOnTop())
        }
      },
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: 'Full Screen',
        enabled: !noWindows,
        accelerator: (process.platform === 'darwin') ? 'Ctrl+Cmd+F' : 'F11',
        role: 'toggleFullScreen'
      },
      {
        label: 'Toggle Browser UI',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'CmdOrCtrl+Shift+H',
        click: function (item) {
          var win = getWin()
          if (!win) return
          toggleShellInterface(win)
        }
      },
      {type: 'separator'},
      {
        label: 'Focus Location Bar',
        accelerator: 'CmdOrCtrl+L',
        click: function (item) {
          var win = getWin()
          createWindowIfNone(win, (win) => {
            win.webContents.send('command', 'focus-location')
          })
        }
      },
      {type: 'separator'},
      {
        label: 'Next Tab',
        enabled: !noWindows,
        accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+Right' : 'CmdOrCtrl+PageDown',
        click: function (item) {
          var win = getWin()
          if (win) tabManager.changeActiveBy(win, 1)
        }
      },
      {
        label: 'Previous Tab',
        enabled: !noWindows,
        accelerator: (process.platform === 'darwin') ? 'Alt+CmdOrCtrl+Left' : 'CmdOrCtrl+PageUp',
        click: function (item) {
          var win = getWin()
          if (win) tabManager.changeActiveBy(win, -1)
        }
      },
      {
        label: 'Tab Shortcuts',
        type: 'submenu',
        submenu: [
          gotoTabShortcut(1),
          gotoTabShortcut(2),
          gotoTabShortcut(3),
          gotoTabShortcut(4),
          gotoTabShortcut(5),
          gotoTabShortcut(6),
          gotoTabShortcut(7),
          gotoTabShortcut(8),
          {
            label: `Last Tab`,
            enabled: !noWindows,
            accelerator: `CmdOrCtrl+9`,
            click: function (item) {
              var win = getWin()
              if (win) tabManager.setActive(win, tabManager.getAll(win).slice(-1)[0])
            }
          }
        ]
      },
      {
        label: 'Pop Out Tab',
        enabled: !noWindows && !isAppWindow,
        accelerator: 'Shift+CmdOrCtrl+P',
        click: function (item) {
          var win = getWin()
          if (!win) return
          var active = tabManager.getActive(win)
          if (!active) return
          tabManager.popOutTab(active)
        }
      }
    ]
  }
  if (process.platform == 'darwin') {
    windowMenu.submenu.push({
      type: 'separator'
    })
    windowMenu.submenu.push({
      label: 'Bring All to Front',
      role: 'front'
    })
  }

  var helpMenu = {
    label: 'Help',
    role: 'help',
    submenu: [
      {
        id: 'beakerHelp',
        label: 'Beaker Help',
        accelerator: 'F1',
        click: function (item) {
          var win = getWin()
          if (win) tabManager.create(win, 'https://beaker-browser.gitbook.io/docs/', {setActive: true})
        }
      },
      {
        id: 'developerPortal',
        label: 'Developer Portal',
        click: function (item) {
          var win = getWin()
          if (win) tabManager.create(win, 'https://beaker.dev/', {setActive: true})
        }
      },
      {type: 'separator'},
      {
        id: 'reportIssue',
        label: 'Report Issue',
        click: function (item) {
          var win = getWin()
          if (win) tabManager.create(win, 'https://github.com/beakerbrowser/beaker/issues', {setActive: true})
        }
      }
    ]
  }
  if (process.platform !== 'darwin') {
    helpMenu.submenu.push({ type: 'separator' })
    helpMenu.submenu.push({
      label: 'About',
      role: 'about',
      click: function (item) {
        var win = getWin()
        if (win) tabManager.create(win, 'beaker://settings', {setActive: true})
      }
    })
  }

  // assemble final menu
  var menus = [fileMenu, editMenu, viewMenu, driveMenu, historyMenu, developerMenu, windowMenu, helpMenu]
  if (process.platform === 'darwin') menus.unshift(darwinMenu)
  return menus
}

export function getToolbarMenu () {
  if (!currentMenuTemplate) return {}
  const get = label => toToolbarItems(currentMenuTemplate.find(menu => menu.label === label).submenu)
  function toToolbarItems (items){
    return items.map(item => {
      if (item.type === 'separator') {
        return {separator: true}
      }
      if (!item.id) return false
      return {
        id: item.id,
        label: item.label,
        accelerator: item.accelerator,
        enabled: typeof item.enabled === 'boolean' ? item.enabled : true
      }
    }).filter(Boolean)
  }
  return {
    File: get('File'),
    Edit: get('Edit'),
    View: get('View'),
    History: get('History'),
    Drive: get('Drive'),
    Developer: get('Developer'),
    Help: get('Help')
  }
}

export function triggerMenuItemById (menuLabel, id) {
  if (!currentMenuTemplate) return
  var items = currentMenuTemplate.find(menu => menu.label === menuLabel).submenu
  if (!items) return
  var item = items.find(item => item.id === id)
  return item.click()
}

// internal helpers
// =

var lastURLProtocol = false
function requiresRebuild (url) {
  const urlProtocol = url ? url.split(':')[0] : false
  // check if this is a change of protocol
  const b = (lastURLProtocol !== urlProtocol)
  lastURLProtocol = urlProtocol
  return b
}

function createWindowIfNone (win, onShow) {
  if (win) return onShow(win)
  win = createShellWindow()
  win.once('show', onShow.bind(null, win))
}
