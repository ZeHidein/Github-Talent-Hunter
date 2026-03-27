export class AudioVolumeMeter {
  private context: AudioContext;
  private volume: number;
  private script: ScriptProcessorNode;
  private mic!: MediaStreamAudioSourceNode;

  constructor(context: AudioContext) {
    this.context = context;
    this.volume = 0.0;
    this.script = this.context.createScriptProcessor(2048, 1, 1);
    this.script.onaudioprocess = (event: AudioProcessingEvent) => {
      const input = event.inputBuffer.getChannelData(0);
      let sum = 0.0;
      for (let i = 0; i < input.length; ++i) {
        sum += input[i] * input[i];
      }
      const instant = Math.sqrt(sum / input.length);
      this.volume = instant;
      // this.volume = 0.95 * this.volume + 0.05 * instant;
    };
  }

  connectToSource(stream: MediaStream, callback?: (error?: Error | null) => void): void {
    console.log('AudioVolumeMeter connecting');
    try {
      this.mic = this.context.createMediaStreamSource(stream);
      this.mic.connect(this.script);
      // Necessary to make the sample run, but should not be.
      this.script.connect(this.context.destination);
      if (callback !== undefined) {
        callback(null);
      }
    } catch (e) {
      console.error(e);
      if (callback !== undefined) {
        callback(e as Error);
      }
    }
  }

  stop(): void {
    console.log('AudioVolumeMeter stopping');
    if (this.mic) {
      this.mic.disconnect();
    }
    if (this.script) {
      this.script.disconnect();
    }
  }

  getVolume(): number {
    return this.volume;
  }
}
