export default class {
    constructor(canvas, options) {
        this.points = [];
        this.context = canvas.getContext("2d");
        this.defaultStrokeStyle = options['strokeStyle'] || '#000000';

        for (let o in options) {
            if (o === 'height' || o === 'width') {
                canvas[o] = options[o];        
            } else {
                this.context[o] = options[o];
            }
        }
    }

    addPoint(x, y, strokeStyle) {
        this.points.push({
            x,
            y,
            strokeStyle
        });
    }

    draw() {
        this.context.clearRect(0, 0, this.context.canvas.width, this.context.canvas.height);
        for (let i = 1; i < this.points.length; i++) {
            this.context.beginPath();
            this.context.moveTo(this.points[i - 1].x, this.points[i - 1].y);
            this.context.lineTo(this.points[i].x, this.points[i].y);
            this.context.strokeStyle = this.points[i].strokeStyle || this.defaultStrokeStyle;
            this.context.stroke();
            this.context.closePath();
        }
    }
}