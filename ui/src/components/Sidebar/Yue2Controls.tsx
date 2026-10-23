import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../stores/useStore'
import { uploadAudio } from '../../api/client'
import { AutoGrowTextarea } from './MusicControls'
import { MyMusicDialog } from './MyMusicDialog'
import { selectMusicStyle, selectedMusicStyles } from '../../lib/musicStyles'
import { GalleryInput } from '../shared/GalleryInput'

export function Yue2Controls() {
  const params = useStore(s => s.params)
  const instrumental = useStore(s => s.musicInstrumental)
  const setParam = useStore(s => s.setParam)
  const uploadBusy = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingFile = useRef<File | null>(null)
  const [pendingName, setPendingName] = useState('')
  const uploadController = useRef<AbortController | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [sourceInfo, setSourceInfo] = useState<{path: string; name: string} | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [myMusic, setMyMusic] = useState(false)
  const [sourceSongOpen, setSourceSongOpen] = useState(false)
  const mode = instrumental ? 0 : (params.model_mode ?? 2)
  useEffect(() => {
    // Keep the displayed default in the request, including before model
    // options load. Zero is an explicit Melody and chords selection.
    if (params.model_mode == null) setParam('model_mode', 2)
  }, [params.model_mode, setParam])
  const source = params.audio_prompt_type === 'A' ? params.audio_guide : ''
  const sourceName = sourceInfo && sourceInfo.path === source ? sourceInfo.name : source?.split(/[\\/]/).pop()
  const handleSourceUpload = async (file: File) => {
    if (uploadBusy.current) return false
    uploadBusy.current = true
    setUploading(true)
    setError('')
    setUploadStatus(`Uploading ${file.name}…`)
    const controller = new AbortController()
    uploadController.current = controller
    const timer = window.setTimeout(() => controller.abort(), 300000)
    try {
      const result = await uploadAudio(file, controller.signal)
      setParam('audio_guide', result.path)
      setParam('audio_prompt_type', 'A')
      setSourceInfo({path: result.path, name: file.name})
      setUploadStatus('')
      return true
    } catch (reason) {
      setUploadStatus('')
      setError(controller.signal.aborted ? 'Upload cancelled or timed out. You can retry the selected file.' : reason instanceof Error ? reason.message : 'Upload failed')
      return false
    } finally {
      window.clearTimeout(timer)
      uploadController.current = null
      uploadBusy.current = false
      setUploading(false)
    }
  }
  return <div className="space-y-2 border-t border-border pt-3">
    <div className="flex items-center gap-3">
      <button type="button" title="Train and manage YuE2 music LoRAs" className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs" onClick={() => setMyMusic(true)}>My music</button>
      <p className="text-[10px] text-text-muted">Music LoRAs and strength: Advanced → LoRAs &amp; presets.</p>
    </div>
    {myMusic && <MyMusicDialog onClose={() => setMyMusic(false)} onSelect={selectMusicStyle}/>}
    <label className="block text-[11px] text-text-muted">Composition planning
      <select aria-label="Composition planning" value={mode} disabled={uploading || instrumental || selectedMusicStyles(params.custom_settings).length > 0}
        onChange={event => {
          const next = Number(event.target.value); setParam('model_mode', next)
          if (next === 2) {
            setParam('audio_prompt_type', '')
            setParam('audio_guide', undefined)
            setParam('custom_settings', {...params.custom_settings, abc: ''})
          }
        }} className="mt-1 w-full rounded-lg border border-border bg-bg-tertiary p-2 text-xs text-text-primary">
        <option value={2}>Direct generation</option><option value={0}>Melody and chords</option><option value={1}>Melody only</option>
      </select>
    </label>
    {instrumental && <p className="text-[11px] text-text-muted">Instrumental uses a dedicated LoRA and Melody and chords planning automatically. Artist LoRAs are paused. The first run downloads about 140 MB.</p>}
    {!instrumental && <details className="text-xs text-text-secondary" onToggle={event => setSourceSongOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer py-1">Score and source song</summary>
      <div className="space-y-2 pt-2">
        <p className="text-[10px] text-text-muted">Extract notes from a recording or enter an ABC score. Supply the lyrics separately. This creates a new recording.</p>
        {sourceSongOpen && <GalleryInput kind="audio" label="YuE2 source song" onFile={handleSourceUpload}
          disabledReason={mode === 2 ? 'Choose a planning mode to use a source song.' : uploading ? 'Uploading source song…' : undefined} />}
        <div className="rounded-lg border border-border p-3 space-y-2" data-yue2-upload-version="3"
          onDragOver={event => { event.preventDefault(); event.stopPropagation() }}
          onDrop={event => {
            event.preventDefault(); event.stopPropagation()
            if (mode === 2 || uploadBusy.current) return
            const file = event.dataTransfer.files?.[0]
            if (!file) return
            if (fileInput.current) fileInput.current.value = ''
            pendingFile.current = file
            setPendingName(file.name); setUploadStatus('File selected. Press Upload selected song.'); setError('')
          }}>
          <p className="text-xs">1. Choose an audio file or drop it here</p>
          <input ref={fileInput} type="file" aria-label="Choose source song file"
            accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac"
            disabled={mode === 2 || uploading}
            className="block w-full min-w-0 text-xs disabled:opacity-40"
            onChange={event => {
              // Retain the native FileList: Upload also reads it directly if change was missed.
              const file = event.currentTarget.files?.[0] || null
              pendingFile.current = file
              setPendingName(file?.name || ''); setError('')
              setUploadStatus(file ? 'File selected. Press Upload selected song.' : 'No file was received. Choose a file or drop it here.')
            }} />
          {pendingName && <p className="break-words text-xs" style={{overflowWrap: 'anywhere'}}>Ready to upload: {pendingName}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={mode === 2 || uploading}
              className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-40"
              onClick={() => {
                // Do not depend solely on React's change event or clear the FileList before reading it.
                const file = fileInput.current?.files?.[0] || pendingFile.current
                if (!file) {
                  setError('No file received from the file picker. Try dragging the MP3 into this box, or open Maestro in an external browser.')
                  setUploadStatus(''); return
                }
                pendingFile.current = file; setPendingName(file.name)
                void handleSourceUpload(file)
              }}>{uploading ? 'Uploading…' : '2. Upload selected song'}</button>
            {uploading && <button type="button" className="rounded border border-border px-2 py-1" onClick={() => uploadController.current?.abort()}>Cancel upload</button>}
          </div>
          {uploadStatus && <p role="status" aria-live="polite" className="break-words text-xs">{uploadStatus}</p>}
          {source && <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-text-muted">Uploaded source song</p>
              <p role="status" aria-live="polite" className="break-words text-xs" style={{overflowWrap: 'anywhere'}}>{sourceName}</p>
            </div>
            <button type="button" disabled={uploading} className="shrink-0 rounded border border-border px-2 py-1 disabled:opacity-40"
              onClick={() => {
                setParam('audio_guide', undefined); setParam('audio_prompt_type', '')
                setSourceInfo(null); setUploadStatus(''); setError('')
                pendingFile.current = null; setPendingName('')
                if (fileInput.current) fileInput.current.value = ''
              }}>Remove</button>
          </div>}
          <p className="text-[10px] text-text-muted">Upload interface v3 · choose, then upload</p>
        </div>
        {!source && mode !== 2 && <AutoGrowTextarea value={String(params.custom_settings?.abc || '')}
          onChange={abc => setParam('custom_settings', {...params.custom_settings, abc})} placeholder="Optional ABC score with Vocal and Ins voices" />}
        {mode === 2 && <p className="text-[10px] text-text-muted">Choose a planning mode to use a score or source song.</p>}
        {error && <p role="alert" className="text-red-400">{error}</p>}
      </div>
    </details>}
    <p className="text-[10px] text-text-muted">48 kHz stereo · CC BY-NC 4.0 model weights</p>
  </div>
}
