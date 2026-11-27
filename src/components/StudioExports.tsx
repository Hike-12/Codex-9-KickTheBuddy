import { useRef, useSyncExternalStore } from 'react'
import { Icon } from './Icon'

export const CONTROLS_POPOVER_ID = 'studio-controls'
export const SHARE_POPOVER_ID = 'studio-sharing'
const mobile = matchMedia('(width < 640px)')
const readCompact = () => mobile.matches
const subscribeCompact = (update: () => void) => {
  mobile.addEventListener('change', update)
  return () => mobile.removeEventListener('change', update)
}

export function StudioExports({
  muted, recording, canRecord, copying, readyClip,
  onMute, onCopy, onRecord, onCancel, onHide, onShare,
}: {
  muted: boolean; recording: number | null; canRecord: boolean; copying: boolean
  readyClip: boolean; onShare: () => void
  onMute: () => void; onCopy: () => void; onRecord: () => void; onCancel: () => void; onHide: () => void
}) {
  const compact = useSyncExternalStore(subscribeCompact, readCompact)
  const options = useRef<HTMLDivElement>(null)
  const closeOptions = () => { if (compact) options.current?.hidePopover?.() }
  return (
    <section className="export-bar" aria-label="Studio sharing and controls">
      {compact && <button type="button" className="control export-icon share-menu-toggle" popoverTarget={SHARE_POPOVER_ID}
        aria-label="Share menu" title="Share menu"><Icon name="share" size={19} /></button>}
      <div id={SHARE_POPOVER_ID} ref={options} className="export-options" popover={compact ? 'auto' : undefined} aria-label="Share and export">
      <button type="button" className="control export-control" onClick={() => { closeOptions(); onCopy() }} aria-label="Copy Dare Link" disabled={copying} title="Copy Dare Link">
        <Icon name="link" size={17} /><span className="export-long">Copy Dare Link</span><span className="export-short">Dare</span>
      </button>
      <button type="button" className="control export-control" onClick={() => { closeOptions(); (recording === null ? onRecord : onCancel)() }}
        aria-label={recording === null ? 'Record 5s Clip' : 'Cancel recording'} disabled={!canRecord}
        title={!canRecord ? 'This browser does not support video recording' : recording === null ? 'Record 5s Clip' : 'Cancel recording'}>
        {recording === null ? <><Icon name="clip" size={17} /><span className="export-long">Record 5s Clip</span><span className="export-short">Clip</span></> :
          <span className="recording-state" role="status"><span className="record-dot" /><span className="export-long">Recording</span> {recording}s</span>}
      </button>
      {compact && readyClip && <button type="button" className="control export-control" onClick={onShare}><Icon name="clip" size={17} />Share clip</button>}
      <button type="button" className="control export-icon controls-toggle" popoverTarget={CONTROLS_POPOVER_ID}
        aria-label="Controls and shortcuts" aria-keyshortcuts="?" title="Controls and shortcuts (?)">{compact ? 'Help & controls' : '?'}</button>
      </div>
      <button type="button" className="control export-icon" onClick={onMute} aria-label={muted ? 'Unmute studio audio' : 'Mute studio audio'}
        aria-pressed={muted} title={muted ? 'Unmute studio audio' : 'Mute studio audio'}>
        <Icon name={muted ? 'mute' : 'sound'} size={19} />
      </button>
      {compact && recording !== null && <button type="button" className="control mobile-export-status" onClick={onCancel} aria-label="Cancel recording">
        <span className="record-dot" /> <span className="recording-state" role="status">{recording}s · Cancel</span>
      </button>}
      {compact && recording === null && readyClip && <button type="button" className="control mobile-export-status" onClick={onShare}>
        <Icon name="share" size={16} />Share clip
      </button>}
      {!compact && readyClip && <div className="desktop-share-files">
        <button type="button" className="control" onClick={onShare}>Share clip</button>
      </div>}
      <section id={CONTROLS_POPOVER_ID} className="controls-popover" popover="auto" aria-labelledby="controls-heading">
        <h2 id="controls-heading">Studio controls</h2>
        <dl>
          <div><dt><kbd>1–8</kbd></dt><dd>Switch gadgets</dd></div>
          <div><dt><kbd>R</kbd></dt><dd>Drop a fresh buddy</dd></div>
          <div><dt><kbd>C</kbd></dt><dd>Wash and clear the room</dd></div>
          <div><dt><kbd>H</kbd></dt><dd>Hide or show the HUD</dd></div>
          <div><dt><kbd>?</kbd></dt><dd>Open or close these controls</dd></div>
        </dl>
        <button className="control" type="button" onClick={onHide}>Hide HUD <kbd>H</kbd></button>
      </section>
    </section>
  )
}
