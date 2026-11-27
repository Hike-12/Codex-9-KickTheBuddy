import type { Vector } from 'matter-js'

export type Pen = CanvasRenderingContext2D

export function shape(ctx: Pen, points: Vector[]) {
  ctx.beginPath()
  points.forEach(({ x, y }, i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
  ctx.closePath()
}

export function path(ctx: Pen, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

export function ellipse(ctx: Pen, x: number, y: number, rx: number, ry: number, fill: string) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
}

export function line(ctx: Pen, x: number, y: number, endX: number, endY: number, color: string, width = 1) {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(endX, endY)
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.stroke()
}
