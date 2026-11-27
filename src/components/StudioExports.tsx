import { Icon } from './Icon'

export const CONTROLS_POPOVER_ID = 'studio-controls'

export function StudioExports({
  muted, recording, canRecord, copying, makingPoster, onMute, onCopy, onRecord, onPoster, onHide,
}: {
  muted: boolean; recording: number | null; canRecord: boolean; copying: boolean; makingPoster: boolean
  onMute: () => void; onCopy: () => void; onRecord: () => void; onPoster: () => void; onHide: () => void
}) {
  return (
    <section className="export-bar" aria-label="Studio sharing and controls">
      <button type="button" className="control export-control" onClick={onCopy} aria-label="Copy Dare Link" disabled={copying} title="Copy Dare Link">
        <Icon name="link" size={17} /><span className="export-long">Copy Dare Link</span><span className="export-short">Dare</span>
      </button>
      <button type="button" className="control export-control" onClick={onRecord} aria-label="Record 5s Clip" disabled={!canRecord || recording !== null}
        title={canRecord ? 'Record 5s Clip' : 'This browser does not support WebM recording'}>
        {recording === null ? <><Icon name="clip" size={17} /><span className="export-long">Record 5s Clip</span><span className="export-short">Clip</span></> :
          <span className="recording-state" role="status"><span className="record-dot" /><span className="export-long">Recording</span> {recording}s</span>}
      </button>
      <button type="button" className="control export-control" onClick={onPoster} aria-label="Export Scorecard" disabled={makingPoster} title="Export Scorecard">
        <Icon name="report" size={17} /><span className="export-long">Export Scorecard</span><span className="export-short">Report</span>
      </button>
      <button type="button" className="control export-icon" onClick={onMute} aria-label={muted ? 'Unmute studio audio' : 'Mute studio audio'}
        aria-pressed={muted} title={muted ? 'Unmute studio audio' : 'Mute studio audio'}>
        <Icon name={muted ? 'mute' : 'sound'} size={19} />
      </button>
      <button type="button" className="control export-icon controls-toggle" popoverTarget={CONTROLS_POPOVER_ID}
        aria-label="Controls and shortcuts" aria-keyshortcuts="?" title="Controls and shortcuts (?)">?</button>
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
