/* Client-side movement prediction with server reconciliation. The client sends
   one input per simulation tick; the server acks the last processed sequence
   number, and unacknowledged inputs are replayed on top of the server state. */
import { moveCircle } from '../../shared/tiles.js';
import { normalize } from '../../shared/math.js';
import { TICK } from '../../shared/constants.js';

export class Predictor {
  constructor() { this.reset(); }

  reset(x = 0, y = 0) {
    this.seq = 0;
    this.pending = [];
    this.pos = { x, y, r: 0.5 };
    this.render = { x, y, moving: 0 };
    this.speed = 5;
    this.ready = false;
  }

  /** Records and applies one input tick; returns the message to send. */
  step(map, input, me) {
    this.seq++;
    const inp = { s: this.seq, mx: input.mx, my: input.my };
    this.pending.push(inp);
    if (this.pending.length > 120) this.pending.shift();
    if (this.canMove(me)) this.apply(map, inp);
    return inp;
  }

  canMove(me) { return me && !me.dead && !me.dash && !me.st; }

  apply(map, inp) {
    const [mx, my] = normalize(inp.mx, inp.my);
    if (!mx && !my) return;
    moveCircle(map, this.pos, mx * this.speed * TICK, my * this.speed * TICK);
  }

  reconcile(map, me, radius) {
    this.speed = me.spd;
    this.pos.r = radius || this.pos.r;
    this.pending = this.pending.filter(p => p.s > me.ack);
    this.pos.x = me.x;
    this.pos.y = me.y;
    if (this.canMove(me)) for (const p of this.pending) this.apply(map, p);
    if (!this.ready) {
      this.render.x = this.pos.x; this.render.y = this.pos.y;
      this.ready = true;
    }
  }

  teleport(x, y) {
    this.pending = [];
    this.pos.x = x; this.pos.y = y;
    this.render.x = x; this.render.y = y;
  }

  /** Smooths the rendered position toward the predicted one. */
  update(dt) {
    const dx = this.pos.x - this.render.x, dy = this.pos.y - this.render.y;
    const d = Math.hypot(dx, dy);
    if (d > 4) { this.render.x = this.pos.x; this.render.y = this.pos.y; }
    else {
      const k = 1 - Math.exp(-dt * 25);
      this.render.x += dx * k; this.render.y += dy * k;
    }
    this.render.moving = Math.min(1, d * 8 + (this.pending.length && this.pending[this.pending.length - 1] && (this.pending[this.pending.length - 1].mx || this.pending[this.pending.length - 1].my) ? 1 : 0));
    return this.render;
  }
}
