/**
 * CodexBackground - Interactive ASCII mouse reveal effect
 * 
 * Authentic OpenAI Codex signature background effect.
 * Monospace matrix characters ('O', '>', '-') dynamically reveal on cursor motion
 * and decay smoothly over time.
 * 
 * Usage:
 *   const bg = new CodexBackground(document.getElementById('container'));
 * 
 * To clean up (e.g. in React useEffect cleanup):
 *   bg.destroy();
 */
class CodexBackground {
  constructor(container, options = {}) {
    this.container = container || document.body;

    // Configuration
    this.cellWidth = options.cellWidth || 10;
    this.cellHeight = options.cellHeight || 14;
    this.radius = options.radius || 32;
    this.opacity = options.opacity !== undefined ? options.opacity : 0.55;
    this.fontSize = options.fontSize || 12;
    this.decayRate = options.decayRate || 0.015;
    this.color = options.color || '255, 255, 255';

    // Setup Canvas
    if (this.container && this.container.tagName === 'CANVAS') {
      this.canvas = this.container;
      this.container = this.canvas.parentElement || document.body;
    } else {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'codex-ascii-canvas';
      this.canvas.style.position = 'absolute';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '100%';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex = options.zIndex !== undefined ? String(options.zIndex) : '0';
      this.container.appendChild(this.canvas);
    }

    this.ctx = this.canvas.getContext('2d');

    // Internal state
    this.grid = [];
    this.cols = 0;
    this.rows = 0;
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.animationFrameId = null;
    this.isRunning = true;

    // Bind methods
    this.resize = this.resize.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onMouseOut = this.onMouseOut.bind(this);
    this.render = this.render.bind(this);

    // Initialize
    this.init();
  }

  init() {
    // Ensure container is positioned relatively so absolute canvas fits inside
    if (this.container !== document.body) {
      const computedStyle = window.getComputedStyle(this.container);
      if (computedStyle.position === 'static') {
        this.container.style.position = 'relative';
      }
    }

    window.addEventListener('resize', this.resize, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('mouseout', this.onMouseOut, { passive: true });
    window.addEventListener('touchmove', this.onTouchMove, { passive: true });
    window.addEventListener('touchend', this.onMouseOut, { passive: true });

    this.resize();
    this.render();
  }

  resize() {
    const width = this.container === document.body
      ? window.innerWidth
      : (this.container.clientWidth || window.innerWidth);
    const height = this.container === document.body
      ? window.innerHeight
      : (this.container.clientHeight || window.innerHeight);

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.cols = Math.ceil(width / this.cellWidth);
    this.rows = Math.ceil(height / this.cellHeight);

    // Re-initialize grid
    this.grid = new Float32Array(this.cols * this.rows);
  }

  onTouchMove(e) {
    if (e.touches && e.touches[0]) {
      this.onMouseMove(e.touches[0]);
    }
  }

  onMouseMove(e) {
    // Get mouse position relative to container
    const rect = this.container.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;

    const minCol = Math.max(0, Math.floor((this.mouseX - this.radius) / this.cellWidth));
    const maxCol = Math.min(this.cols - 1, Math.floor((this.mouseX + this.radius) / this.cellWidth));
    const minRow = Math.max(0, Math.floor((this.mouseY - this.radius) / this.cellHeight));
    const maxRow = Math.min(this.rows - 1, Math.floor((this.mouseY + this.radius) / this.cellHeight));

    for (let i = minCol; i <= maxCol; i++) {
      for (let j = minRow; j <= maxRow; j++) {
        const cx = i * this.cellWidth + this.cellWidth / 2;
        const cy = j * this.cellHeight + this.cellHeight / 2;

        const dist = Math.hypot(this.mouseX - cx, this.mouseY - cy);

        if (dist < this.radius) {
          let intensity = 1 - (dist / this.radius);
          intensity = Math.pow(intensity, 1.0);

          const idx = j * this.cols + i;
          this.grid[idx] = Math.min(1.0, this.grid[idx] + intensity * 0.9);
        }
      }
    }
  }

  onMouseOut() {
    this.mouseX = -1000;
    this.mouseY = -1000;
  }

  render() {
    if (!this.isRunning) return;

    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);

    this.ctx.clearRect(0, 0, width, height);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.font = `400 ${this.fontSize}px monospace`;

    for (let i = 0; i < this.cols; i++) {
      for (let j = 0; j < this.rows; j++) {
        const idx = j * this.cols + i;

        if (this.grid[idx] > 0) {
          this.grid[idx] -= this.decayRate;
          if (this.grid[idx] < 0) this.grid[idx] = 0;

          const life = this.grid[idx];

          if (life > 0.01) {
            let char = '-';

            // Sequence: O -> > -> -
            if (life > 0.6) {
              char = 'O';
            } else if (life > 0.3) {
              char = '>';
            } else {
              char = '-';
            }

            this.ctx.fillStyle = `rgba(${this.color}, ${this.opacity})`;

            const cx = i * this.cellWidth + this.cellWidth / 2;
            const cy = j * this.cellHeight + this.cellHeight / 2;
            this.ctx.fillText(char, cx, cy);
          }
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.render);
  }

  destroy() {
    this.isRunning = false;
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mouseout', this.onMouseOut);
    window.removeEventListener('touchmove', this.onTouchMove);
    window.removeEventListener('touchend', this.onMouseOut);
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CodexBackground;
} else if (typeof window !== 'undefined') {
  window.CodexBackground = CodexBackground;
}
