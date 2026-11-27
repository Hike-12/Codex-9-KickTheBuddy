import { clamp } from './model'

type Loop = 'vortex' | 'freeze' | 'quake'
export type Foley =
  | { kind: 'impact' | 'anvil' | 'boing'; speed: number }
  | { kind: 'splat'; egg: boolean }
  | { kind: 'loop'; loop: Loop; active: boolean }
  | { kind: 'pop' | 'punch' | 'shockwave' | 'ice' | 'pet' }

type Graph = {
  context: AudioContext; bus: DynamicsCompressorNode; output: GainNode
  recording: MediaStreamAudioDestinationNode; noise: AudioBuffer | null
}
type Hum = { kind: Loop; envelope: GainNode; oscillators: OscillatorNode[] }

export class CartoonAudio {
  private graph: Graph | null = null
  private muted = false
  private voices = 0
  private requestedLoop: Loop | null = null
  private loop: Hum | null = null

  async unlock() {
    if (typeof AudioContext === 'undefined') return false
    if (!this.ready && navigator.userActivation && !navigator.userActivation.isActive) return false
    let pending: AudioContext | undefined
    try {
      if (!this.graph) {
        const context = pending = new AudioContext({ latencyHint: 'interactive' })
        const bus = context.createDynamicsCompressor()
        bus.threshold.value = -18
        bus.knee.value = 13
        bus.ratio.value = 5
        bus.attack.value = 0.003
        bus.release.value = 0.17
        const output = context.createGain()
        output.gain.value = this.muted ? 0 : 0.68
        const recording = context.createMediaStreamDestination()
        bus.connect(output)
        output.connect(recording)
        output.connect(context.destination)
        this.graph = { context, bus, output, recording, noise: null }
        pending = undefined
      }
      const graph = this.graph
      if (graph.context.state !== 'running') await graph.context.resume()
      if (this.graph !== graph || graph.context.state !== 'running') return false
      this.syncLoop()
      return true
    } catch {
      if (pending) void pending.close().catch(() => {})
      return false
    }
  }

  get ready() { return this.graph?.context.state === 'running' }

  setMuted(value: boolean) {
    this.muted = value
    const graph = this.graph
    if (graph) graph.output.gain.setValueAtTime(value ? 0 : 0.68, graph.context.currentTime)
  }

  recordingTrack() {
    return this.graph?.recording.stream.getAudioTracks()[0] ?? null
  }

  destroy() {
    const graph = this.graph
    this.requestedLoop = null
    this.stopLoop()
    this.graph = null
    if (!graph) return
    for (const track of graph.recording.stream.getTracks()) track.stop()
    void graph.context.close().catch(() => {})
  }

  play = (event: Foley) => {
    if (event.kind === 'loop') {
      if (event.active) this.requestedLoop = event.loop
      else if (this.requestedLoop === event.loop) {
        this.requestedLoop = null
        this.stopLoop()
      }
      this.syncLoop()
      return
    }
    const graph = this.graph
    if (!graph || graph.context.state !== 'running') return
    switch (event.kind) {
      case 'impact': {
        const force = clamp(event.speed / 29, 0.13, 1)
        this.tone(graph, 112 + force * 84, 39, 0.12 + force * 0.11, 0.1 + force * 0.25, 'triangle')
        this.tone(graph, 78 + force * 36, 34, 0.16, force * 0.16, 'sine')
        this.noise(graph, 'lowpass', 530, 0.075, force * 0.13)
        break
      }
      case 'boing': {
        const force = clamp(event.speed / 30, 0.23, 1)
        this.tone(graph, 320 + force * 135, 132, 0.43, 0.18, 'sine', 0, 58)
        this.tone(graph, 480, 210, 0.24, 0.06, 'triangle', 0.024, 51)
        break
      }
      case 'splat':
        this.noise(graph, 'bandpass', event.egg ? 630 : 980, 0.16, 0.24, 0, 1.3, 243)
        this.tone(graph, event.egg ? 191 : 268, 64, 0.135, 0.13, 'triangle', 0.011)
        break
      case 'pop':
        this.tone(graph, 180, 620, 0.082, 0.22, 'sine')
        this.noise(graph, 'bandpass', 1360, 0.034, 0.13)
        break
      case 'anvil': {
        const force = clamp(event.speed / 31, 0.25, 1)
        for (const [pitch, length, level] of [[420, 1.04, 0.21], [665, 0.78, 0.15], [1180, 0.49, 0.10]] as const) {
          this.tone(graph, pitch, pitch, length, level * force, 'sine')
        }
        this.noise(graph, 'highpass', 1620, 0.076, force * 0.12)
        break
      }
      case 'punch':
        this.noise(graph, 'bandpass', 1440, 0.19, 0.2, 0, 0.65, 285)
        this.tone(graph, 174, 42, 0.13, 0.29, 'triangle', 0.056)
        break
      case 'shockwave':
        this.noise(graph, 'lowpass', 4300, 0.46, 0.3, 0, 0.69, 160)
        this.tone(graph, 80, 28, 0.53, 0.37, 'sine')
        break
      case 'ice':
        for (let i = 0; i < 5; i++) {
          this.noise(graph, 'bandpass', 3800 + (i % 3) * 930, 0.085 + i * 0.014, 0.14, i * 0.025, 1.16)
          this.tone(graph, 1900 + i * 390, 1440 + i * 335, 0.17 + i * 0.041, 0.045, 'sine', i * 0.024)
        }
        this.tone(graph, 290, 120, 0.25, 0.08, 'triangle')
        break
      case 'pet':
        this.tone(graph, 329.63, 323, 0.18, 0.061, 'triangle')
        this.tone(graph, 440, 435, 0.22, 0.036, 'sine', 0.052)
        break
    }
  }

  private envelope(graph: Graph, start: number, duration: number, volume: number) {
    const output = graph.context.createGain()
    const floor = 0.0001
    output.gain.setValueAtTime(floor, start)
    output.gain.exponentialRampToValueAtTime(Math.max(floor, volume), start + Math.min(0.012, duration * 0.22))
    output.gain.exponentialRampToValueAtTime(floor, start + duration)
    output.connect(graph.bus)
    return output
  }

  private tone(graph: Graph, pitch: number, end: number, duration: number, volume: number, type: OscillatorType, delay = 0, wobble = 0) {
    if (this.voices >= 42) return
    this.voices++
    const { context } = graph
    const start = context.currentTime + delay + 0.002
    const output = this.envelope(graph, start, duration, volume)
    const note = context.createOscillator()
    note.type = type
    note.frequency.setValueAtTime(pitch, start)
    note.frequency.exponentialRampToValueAtTime(end, start + duration * 0.83)
    note.connect(output)
    const modulation = wobble > 0 ? context.createOscillator() : null
    const depth = modulation ? context.createGain() : null
    if (modulation && depth) {
      modulation.frequency.setValueAtTime(20, start)
      modulation.frequency.exponentialRampToValueAtTime(4.7, start + duration)
      depth.gain.setValueAtTime(wobble, start)
      depth.gain.exponentialRampToValueAtTime(1, start + duration)
      modulation.connect(depth).connect(note.frequency)
      modulation.start(start)
      modulation.stop(start + duration + 0.018)
    }
    note.start(start)
    note.stop(start + duration + 0.014)
    note.onended = () => {
      this.voices--
      note.disconnect()
      output.disconnect()
      modulation?.disconnect()
      depth?.disconnect()
    }
  }

  private noise(graph: Graph, type: BiquadFilterType, pitch: number, duration: number, volume: number, delay = 0, q = 0.82, end = pitch) {
    if (this.voices >= 42) return
    this.voices++
    const { context } = graph
    if (!graph.noise) {
      const samples = context.createBuffer(1, Math.ceil(context.sampleRate * 0.62), context.sampleRate)
      const data = samples.getChannelData(0)
      let low = 0
      let mid = 0
      let high = 0
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1
        low = 0.997 * low + white * 0.052
        mid = 0.963 * mid + white * 0.17
        high = 0.57 * high + white * 0.39
        data[i] = (low + mid + high + white * 0.32) * 0.27
      }
      graph.noise = samples
    }
    const start = context.currentTime + delay + 0.002
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    filter.type = type
    filter.frequency.setValueAtTime(pitch, start)
    filter.frequency.exponentialRampToValueAtTime(end, start + duration)
    filter.Q.value = q
    const output = this.envelope(graph, start, duration, volume)
    source.buffer = graph.noise
    source.connect(filter).connect(output)
    source.start(start, Math.random() * 0.08)
    source.stop(start + duration + 0.014)
    source.onended = () => {
      this.voices--
      source.disconnect()
      filter.disconnect()
      output.disconnect()
    }
  }

  private syncLoop() {
    const { requestedLoop: kind, graph } = this
    if (!graph || graph.context.state !== 'running' || this.loop?.kind === kind) return
    this.stopLoop()
    if (!kind) return
    const { context } = graph
    const start = context.currentTime
    const envelope = context.createGain()
    envelope.gain.setValueAtTime(0, start)
    envelope.gain.setTargetAtTime(kind === 'vortex' ? 0.20 : kind === 'quake' ? 0.13 : 0.049, start, 0.072)
    envelope.connect(graph.bus)
    const carrier = context.createOscillator()
    carrier.type = kind === 'freeze' ? 'sine' : 'triangle'
    carrier.frequency.setValueAtTime(kind === 'vortex' ? 55 : kind === 'quake' ? 38 : 1360, start)
    carrier.frequency.setTargetAtTime(kind === 'vortex' ? 93 : kind === 'quake' ? 46 : 2080, start, kind === 'vortex' ? 0.9 : 0.5)
    const lfo = context.createOscillator()
    const depth = context.createGain()
    lfo.frequency.value = kind === 'vortex' ? 9 : kind === 'quake' ? 14 : 27
    depth.gain.value = kind === 'vortex' ? 6 : kind === 'quake' ? 10 : 93
    lfo.connect(depth).connect(carrier.frequency)
    carrier.connect(envelope)
    carrier.start(start)
    lfo.start(start)
    carrier.onended = () => {
      carrier.disconnect()
      lfo.disconnect()
      depth.disconnect()
      envelope.disconnect()
    }
    const overtones = [carrier, lfo]
    if (kind === 'freeze') {
      const crystal = context.createOscillator()
      const shimmer = context.createGain()
      crystal.frequency.setValueAtTime(2300, start)
      crystal.frequency.setTargetAtTime(2950, start, 0.71)
      shimmer.gain.value = 0.45
      crystal.connect(shimmer).connect(envelope)
      crystal.start(start)
      crystal.onended = () => { crystal.disconnect(); shimmer.disconnect() }
      overtones.push(crystal)
    }
    this.loop = { kind, envelope, oscillators: overtones }
  }

  private stopLoop() {
    const loop = this.loop
    const graph = this.graph
    this.loop = null
    if (!loop || !graph) return
    const now = graph.context.currentTime
    loop.envelope.gain.setTargetAtTime(0, now, 0.016)
    for (const oscillator of loop.oscillators) oscillator.stop(now + 0.09)
  }
}
