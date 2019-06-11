/* globals customElements */
import { LitElement, html, css } from '../vendor/lit-element/lit-element'
import { fromEventStream } from '@beaker/core/web-apis/fg/event-target'
import moment from 'moment'
import * as bg from './bg-process-rpc'
import commonCSS from './common.css'

class BrowserMenu extends LitElement {
  static get properties () {
    return {
      submenu: {type: String}
    }
  }

  constructor () {
    super()

    this.browserInfo = bg.beakerBrowser.getInfo()
    const isDarwin = this.browserInfo.platform === 'darwin'
    const cmdOrCtrlChar = isDarwin ? '⌘' : '^'
    this.accelerators = {
      newWindow: cmdOrCtrlChar + 'N',
      newTab: cmdOrCtrlChar + 'T',
      findInPage: cmdOrCtrlChar + 'F',
      history: cmdOrCtrlChar + (isDarwin ? 'Y' : 'H'),
      openFile: cmdOrCtrlChar + 'O'
    }

    this.submenu = ''
    this.sumProgress = null // null means no active downloads
    this.shouldPersistDownloadsIndicator = false

    // wire up events
    var dlEvents = fromEventStream(bg.downloads.createEventsStream())
    dlEvents.addEventListener('sum-progress', this.onDownloadsSumProgress.bind(this))
  }

  reset () {
    this.submenu = ''
  }

  async init () {
    this.profile = await bg.beakerBrowser.getUserSession().catch(err => undefined)
    await this.requestUpdate()
  }

  render () {
    if (!this.profile) {
      return html`<div></div>`
    }

    if (this.submenu === 'create-new') {
      return this.renderCreateNew()
    }

    // auto-updater
    var autoUpdaterEl = html``
    if (this.browserInfo && this.browserInfo.updater.isBrowserUpdatesSupported && this.browserInfo.updater.state === 'downloaded') {
      autoUpdaterEl = html`
        <div class="section auto-updater">
          <div class="menu-item auto-updater" @click=${this.onClickRestart}>
            <i class="fa fa-arrow-circle-up"></i>
            <span class="label">Restart to update Beaker</span>
          </div>
        </div>
      `
    }

    // render the progress bar if downloading anything
    var progressEl = ''
    if (this.shouldPersistDownloadsIndicator && this.sumProgress && this.sumProgress.receivedBytes <= this.sumProgress.totalBytes) {
      progressEl = html`<progress value=${this.sumProgress.receivedBytes} max=${this.sumProgress.totalBytes}></progress>`
    }

    return html`
      <link rel="stylesheet" href="beaker://assets/font-awesome.css">
      <div class="wrapper">
        <div class="column">
          <div class="section">
            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="fas fa-home"></i>
              <span class="label">Home</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="far fa-window-restore"></i>
              <span class="label">Applications</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="far fa-copy"></i>
              <span class="label">Documents</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="fas fa-music"></i>
              <span class="label">Music</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="fas fa-image"></i>
              <span class="label">Photos</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="fas fa-film"></i>
              <span class="label">Videos</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://library')}>
              <i class="fas fa-sitemap"></i>
              <span class="label">Websites</span>
            </div>
          </div>
        </div>
        <div class="column">
          <div class="section">
            <div class="menu-item profile" @click=${e => this.onOpenPage(e, this.profile.url)}>
              <img src="asset:thumb:${this.profile.url}">
              <span>${this.profile.title}</span>
            </div>
          </div>
          ${autoUpdaterEl}

          <div class="section">
            <div class="menu-item" @click=${e => this.onOpenNewWindow()}>
              <i class="far fa-window-maximize"></i>
              <span class="label">New Window</span>
              <span class="shortcut">${this.accelerators.newWindow}</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenNewTab()}>
              <i class="far fa-file"></i>
              <span class="label">New Tab</span>
              <span class="shortcut">${this.accelerators.newTab}</span>
            </div>
          </div>

          <div class="section">
            <div class="menu-item" @click=${e => this.onOpenFile()}>
              <i></i>
              <span class="label">Open File...</span>
              <span class="shortcut">${this.accelerators.openFile}</span>
            </div>
          </div>

          <div class="section">
            <div class="menu-item downloads" @click=${e => this.onClickDownloads(e)}>
              <i class="fas fa-arrow-down"></i>
              <span class="label">Downloads</span>
              ${progressEl}
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://history')}>
              <i class="fa fa-history"></i>
              <span class="label">History</span>
              <span class="shortcut">${this.accelerators.history}</span>
            </div>
            
            <div class="menu-item" @click=${e => this.onOpenPage(e, 'beaker://settings')}>
              <i class="fas fa-cog"></i>
              <span class="label">Settings</span>
            </div>
          </div>

          <div class="section">
            <div class="menu-item" @click=${e => this.onOpenPage(e, 'dat://beakerbrowser.com/docs/')}>
              <i class="far fa-question-circle"></i>
              <span class="label">Help</span>
            </div>

            <div class="menu-item" @click=${e => this.onOpenPage(e, 'https://github.com/beakerbrowser/beaker/issues/new')}>
              <i class="far fa-flag"></i>
              <span class="label">Report an Issue</span>
            </div>
          </div>
        </div>
      </div>
    `
  }

  renderCreateNew () {
    return html`
      <link rel="stylesheet" href="beaker://assets/font-awesome.css">
      <div class="wrapper">
        <div class="header">
          <button class="btn" @click=${e => this.onShowSubmenu('')} title="Go back">
            <i class="fa fa-angle-left"></i>
          </button>
          <h2>Create New</h2>
        </div>

        <div class="section">
          <div class="menu-item" @click=${e => this.onCreateSite(e)}>
            <i class="far fa-clone"></i>
            <span class="label">Empty project</span>
          </div>

          <div class="menu-item" @click=${e => this.onCreateSite(e, 'website')}>
            <i class="fa fa-sitemap"></i>
            <span class="label">Website</span>
          </div>

          <div class="menu-item" @click=${e => this.onCreateSiteFromFolder(e)}>
            <i class="far fa-folder"></i>
            <span class="label">From folder</span>
          </div>
        </div>
      </div>`
  }

  // events
  // =

  onShowSubmenu (v) {
    this.submenu = v
  }

  onOpenNewWindow () {
    bg.shellMenus.createWindow()
    bg.shellMenus.close()
  }

  onOpenNewTab () {
    bg.shellMenus.createTab()
    bg.shellMenus.close()
  }

  async onOpenFile () {
    bg.shellMenus.close()
    var files = await bg.beakerBrowser.showOpenDialog({
       title: 'Open file...',
       properties: ['openFile', 'createDirectory']
    })
    if (files && files[0]) {
      bg.shellMenus.createTab('file://' + files[0])
    }
  }

  onClickDownloads (e) {
    this.shouldPersistDownloadsIndicator = false
    bg.shellMenus.createTab('beaker://downloads')
    bg.shellMenus.close()
  }

  onDownloadsSumProgress (sumProgress) {
    this.shouldPersistDownloadsIndicator = true
    this.sumProgress = sumProgress
    this.requestUpdate()
  }

  async onCreateSite (e, template) {
    bg.shellMenus.close()

    // create a new archive
    const url = await bg.datArchive.createArchive({template, prompt: false})
    bg.shellMenus.createTab('beaker://editor/' + url)
    bg.shellMenus.close()
  }

  async onCreateSiteFromFolder (e) {
    bg.shellMenus.close()

    // ask user for folder
    const folder = await bg.beakerBrowser.showOpenDialog({
      title: 'Select folder',
      buttonLabel: 'Use folder',
      properties: ['openDirectory']
    })
    if (!folder || !folder.length) return

    // create a new archive
    const url = await bg.datArchive.createArchive({prompt: false})
    await bg.archives.setLocalSyncPath(url, folder[0], {previewMode: true})
    bg.shellMenus.createTab('beaker://editor/' + url)
    bg.shellMenus.close()
  }

  async onShareFiles (e) {
    bg.shellMenus.close()

    // ask user for files
    const filesOnly = this.browserInfo.platform === 'linux' || this.browserInfo.platform === 'win32'
    const files = await bg.beakerBrowser.showOpenDialog({
      title: 'Select files to share',
      buttonLabel: 'Share files',
      properties: ['openFile', filesOnly ? false : 'openDirectory', 'multiSelections'].filter(Boolean)
    })
    if (!files || !files.length) return

    // create the dat and import the files
    const url = await bg.datArchive.createArchive({
      title: `Shared files (${moment().format('M/DD/YYYY h:mm:ssa')})`,
      description: `Files shared with Beaker`,
      prompt: false
    })
    await Promise.all(files.map(src => bg.datArchive.importFromFilesystem({src, dst: url, inplaceImport: false})))

    // open the new archive in the editor
    bg.shellMenus.createTab('beaker://editor/' + url)
    bg.shellMenus.close()
  }

  onOpenPage (e, url) {
    bg.shellMenus.createTab(url)
    bg.shellMenus.close()
  }

  onClickRestart () {
    bg.shellMenus.close()
    bg.beakerBrowser.restartBrowser()
  }
}
BrowserMenu.styles = [commonCSS, css`
.wrapper {
  display: flex;
}

.column {
  flex: 1;
}

.column:first-child {
  flex: 0 0 160px;
  background: #fafafa;
  border-right: 1px solid #ddd;
}

.wrapper::-webkit-scrollbar {
  display: none;
}

.section:last-child {
  border-bottom: 0;
}

.menu-item.profile {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 300;
  height: 60px;
}

.menu-item.profile img {
  margin-right: 14px;
  height: 48px;
  width: 48px;
  border-radius: 50%;
}

.section.auto-updater {
  padding-bottom: 0;
  border-bottom: 0;
}

.menu-item.auto-updater {
  height: 35px;
  background: #DCEDC8;
  border-top: 1px solid #c5e1a5;
  border-bottom: 1px solid #c5e1a5;
  color: #000;
}

.menu-item.auto-updater i {
  color: #7CB342;
}

.menu-item.auto-updater:hover {
  background: #d0e7b5;
}

.menu-item i.more {
  margin-left: auto;
  padding-right: 0;
  text-align: right;
}

.menu-item .more,
.menu-item .shortcut {
  color: #777;
  margin-left: auto;
}

.menu-item .shortcut {
  font-size: 12px;
  -webkit-font-smoothing: antialiased;
}

.menu-item.downloads progress {
  margin-left: 20px;
  flex: 1;
}
`]

customElements.define('browser-menu', BrowserMenu)