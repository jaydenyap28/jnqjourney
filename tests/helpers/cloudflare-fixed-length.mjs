// Contract shim only. CPU evidence must come from native Preview traces.
export class FixtureFixedLengthStream {
  constructor(length) {
    let count=0
    const stream=new TransformStream({
      transform(chunk,controller){count+=chunk.byteLength;if(count>length)throw new Error('Length exceeded');controller.enqueue(chunk)},
      flush(){if(count!==length)throw new Error('Length short')},
    })
    this.readable=stream.readable;this.writable=stream.writable
  }
}
