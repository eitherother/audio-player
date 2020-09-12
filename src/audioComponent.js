'use strict';
import LineDrawing from './lineDrawing.js';

class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        this.cursorBarMax = 182;
        this.volume = 1;
    }

    connectedCallback() {
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = AudioPlayer.template;

        // Listen for added audio tracks, update DOM with tracks
        this.shadowRoot.querySelector('slot').addEventListener('slotchange', () => {
            for (let [i, elem] of this.querySelectorAll('audio').entries()) {
                let div = document.createElement('div');
                div.innerHTML = AudioPlayer.trackTemplate(elem.title, i);
                this.shadowRoot.querySelector('.audio-top').appendChild(div.children[0]);
            }

            this.drawPlayer();
        });

        if (this.constructor.isMobileSafari()) {
            // Mobile safari doesn't allow uses to adjust volume attribute on HTML audio element
            this.shadowRoot.querySelector('.volume-wrapper').style.display = "none";
        }

        this.addEventHandlers();
    }

    addEventHandlers() {
        let audioTop = this.shadowRoot.querySelector('.audio-top');
        let cursorBar = this.shadowRoot.querySelector('.cursor-wrapper');
        let cursor = cursorBar.querySelector('.cursor');
        let volumeWrapper = this.shadowRoot.querySelector('.volume-wrapper');
        let component = this;

        // Volume on/off
        volumeWrapper.addEventListener('click', () => {
            component.volume = (component.volume + 1) % 2;
            volumeWrapper.querySelector('.volume-icon').classList.toggle('volume-icon-mute');

            if (isNaN(component.currentTrack)) {
                return;
            }
            
            let player = component.querySelectorAll('audio')[component.currentTrack];
            player.volume = component.volume;
        });

        // Listener for play/pause
        audioTop.addEventListener('click', this.playOrPause.bind(this));

        // Single click jumps cursor to new location
        function singleClick(e) {
            if (isNaN(component.currentTrack)) {
                return;
            }

            let position = newPosition(e);
            component.holdTrack();
            cursor.style.left = position + 'px';
            component.updateTrackFromCursor();
        }

        cursorBar.addEventListener('click', singleClick);

        // Touch/click and move cursor pauses track and then plays from new location
        function startHandler(e) {
            if (isNaN(component.currentTrack) || (e.button > 0 && !e.touches)) {
                return;
            }

            component.holdTrack();
            window.addEventListener(e.type === 'mousedown' ? 'mousemove' : 'touchmove', moveHandler);
            window.addEventListener(e.type === 'mousedown' ? 'mouseup' : 'touchend', endHandler);
            cursorBar.removeEventListener('click', singleClick);
            e.stopPropagation();
            e.preventDefault();
        }

        function moveHandler(e) {
            let position = newPosition(e);
            cursor.style.left = position + 'px';
            component.drawPlayer();
            component.updateTime(position / component.cursorBarMax);
        }

        function endHandler(e) {
            window.removeEventListener(e.type === 'mouseup' ? 'mousemove' : 'touchmove', moveHandler);
            window.removeEventListener(e.type === 'mouseup' ? 'mouseup' : 'touchend', endHandler);
            setTimeout(() => { // delay listener in case this event triggers 'click'
                cursorBar.addEventListener('click', singleClick);
            }, 0);

            component.updateTrackFromCursor();
        }

        function newPosition(e) {
            let rect = cursorBar.getBoundingClientRect();
            let x = e.touches ? e.touches[0].clientX : e.clientX;
            let position = x - rect.left - 8;
            if (position < 0) {
                position = 0;
            } else if (position > component.cursorBarMax) {
                position = component.cursorBarMax;
            }

            return position;
        }

        this.shadowRoot.querySelector('.cursor').addEventListener('mousedown', startHandler);
        this.shadowRoot.querySelector('.cursor').addEventListener('touchstart', startHandler);
    }

    playOrPause(event) {
        var currentWrapper = event.target.closest('.audio-wrapper');
        if (!currentWrapper) {
            return;
        }

        let wrappers = this.shadowRoot.querySelectorAll('.audio-wrapper');
        let players = this.querySelectorAll('audio');
        let currentPlayer = players[currentWrapper.dataset.index];

        if (!currentPlayer || currentPlayer.error) {
            currentWrapper.querySelector('.audio-title').classList.add('audio-title-error');
            currentWrapper.querySelector('.audio-play').classList.add('audio-play-error');
            return;
        }

        // indicate selection
        currentWrapper.classList.add('audio-wrapper-selected');

        if (currentPlayer.paused) {
            clearInterval(this.clearIntervalId);

            // turn off other audio stream if it is playing
            var oldTrack = this.currentTrack;
            this.currentTrack = parseInt(currentWrapper.dataset.index);
            if (!isNaN(oldTrack) && oldTrack !== this.currentTrack) {
                let oldWrapper = wrappers[oldTrack];
                oldWrapper.classList.remove('audio-wrapper-selected');
                oldWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
                players[oldWrapper.dataset.index].pause();
            }

            // reset cursor if changing or restarting track
            if (oldTrack !== this.currentTrack || Math.abs(currentPlayer.duration - currentPlayer.currentTime) < 0.001) {
                currentPlayer.currentTime = 0;
                this.updateCursorFromTrack();
                currentPlayer.onended = () => {
                    clearInterval(this.clearIntervalId);
                    currentWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
                    this.updateCursorFromTrack(); // move cursor to end in case last update never happened
                };
            }
            
            // play, and set up recurring cursor updates
            currentPlayer.volume = this.volume;
            currentWrapper.querySelector('.audio-icon').classList.add('audio-icon-pause');
            this.shadowRoot.querySelector('.time-bar-title').innerText = currentPlayer.title;
            currentPlayer.play();
            this.clearIntervalId = setInterval(this.updateCursorFromTrack.bind(this), 1000);
        } else {
            currentPlayer.pause();
            currentWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
            clearInterval(this.clearIntervalId);
        }
    }

    holdTrack() {
        clearInterval(this.clearIntervalId);
        let player = this.querySelectorAll('audio')[this.currentTrack];
        if (!player.paused) {
            player.resumeOnRelease = true;
            player.pause();
        }
    }

    updateTrackFromCursor() {
        let cursor = this.shadowRoot.querySelector('.cursor');
        let position = (parseInt(cursor.style.left) || 0) / this.cursorBarMax;
        let player = this.querySelectorAll('audio')[this.currentTrack];
        if (player && position >= 0 && position <= 1) {
            player.currentTime = position * player.duration;
        }

        this.drawPlayer();
        this.updateTime();

        if (position === 1) {
            // As of Sept 2020, some browsers (Safari, Edge) won't fire onended callback if time is manually set to the end
            player.onended();
        } else if (player.resumeOnRelease) {
            player.play();
            this.clearIntervalId = setInterval(this.updateCursorFromTrack.bind(this), 1000);
        }

        delete player.resumeOnRelease;
    }

    updateCursorFromTrack() {
        let player = this.querySelectorAll('audio')[this.currentTrack];
        var position = this.cursorBarMax * player.currentTime / player.duration;
        this.shadowRoot.querySelector('.cursor').style.left = position + 'px';

        this.drawPlayer();
        this.updateTime();
    }

    updateTime(position) {
        function formatTime(time) {
            let minutes = Math.floor(time / 60);
            let seconds =  Math.round(time % 60);
            if (seconds === 60) {
                seconds = 0;
                minutes++;
            }

            let paddedSeconds = (new Array(2).join('0') + seconds).slice(-2);
            return minutes + ':' + paddedSeconds;
        }

        let player = this.querySelectorAll('audio')[this.currentTrack];
        let currentTime = isNaN(position) ? player.currentTime : position * player.duration;
        let current = formatTime(currentTime);
        let total = formatTime(player.duration);
        this.shadowRoot.querySelector('.time-bar-time').innerHTML = current + ' / ' + total;
    }

    drawPlayer() {
        const canvas = this.shadowRoot.querySelector('.tracks-canvas');
        const ld = new LineDrawing(canvas, {
            height: canvas.parentElement.offsetHeight,
            width: this.shadowRoot.querySelector('.audio-top').offsetWidth,
            fillStyle: 'transparent',
            lineWidth: 2,
            strokeStyle: '#143e67'
        });

        // Create path and draw
        let playbar = this.shadowRoot.querySelector('.cursor-wrapper');
        let playbarHeight = canvas.height - (playbar.offsetHeight / 2) - 12;
        let playbarWidth = playbar.offsetWidth + 38;
        let cursor = this.shadowRoot.querySelector('.cursor');
        let divider = 24 + (parseInt(cursor.style.left) || 0);

        [
            [2, 2],
            [2, playbarHeight - 1],
            [2, playbarHeight - 2, 'transparent'],
            [16, playbarHeight - 2],
            [24, playbarHeight - 2, 'transparent'],
            [divider, playbarHeight - 2, '#ff5200'],
            [playbarWidth, playbarHeight - 2],
            [214, playbarHeight - 16, 'transparent'],
            [214, playbarHeight + 12]
        ].forEach(p => ld.addPoint(...p));

        ld.draw();
    }

    static isMobileSafari() {
        let ua = window.navigator.userAgent;
        let iOS = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
        let webkit = !!ua.match(/WebKit/i);
        return iOS && webkit && !ua.match(/CriOS/i);
    }

    static get template() {
        const styles = `
            .audio-top {
                padding-bottom: 0px;
            }

            .canvas-wrapper {
                margin: auto;
                max-width: 300px;
            }
            
            .ellipsis {
                overflow: hidden;
                white-space: nowrap;
                text-overflow: ellipsis;
            }

            .audio-title {
                flex: 1;
                margin-left: 12px;
                font-size: 14px;
                color: #133759;
                z-index: 1;
            }

            .audio-title-error {
                color: darkred;
            }
            
            .audio-play {
                height: 32px;
                width: 32px;
                border-radius: 24px;
                border: solid 1px #1e4e7d;
                background: linear-gradient(45deg, #bbbbbb, #f3f3f3);
                flex: none;
                margin-right: 12px;
                background: linear-gradient(45deg, #143e67, #112539);
                z-index: 1;
            }
            
            .audio-play-error {
                background: darkred;
                border: solid 1px #a2a2a2;
            }

            .audio-bar {
                display: flex;
                align-items: center;
            }

            .time-bar {
                display: flex;
                height: 16px;
                width: 260px;
                line-height: 14px;
                font-size: 14px;
                margin-top: -4px;
            }

            .time-bar-title {
                flex: 1;
            }

            .volume-wrapper {
                align-items: center;
                border-radius:10%;
                cursor: pointer;
                display: flex;
                height: 38px;
                margin-left: 4px;
                width: 38px;
                justify-content: center;
                -webkit-tap-highlight-color: rgba(255, 255, 255, 0);
            }

            .volume-icon {
                height:24px;
                width: 24px;
                background: url('./images/volume_up-24px.svg');
            }

            .volume-icon.volume-icon-mute {
                background: url('./images/volume_off-24px.svg');
            }

            .cursor-wrapper {
                height:48px;
                width: 192px;
                margin: 2px 0px;
                cursor: pointer;
                -webkit-tap-highlight-color: rgba(255, 255, 255, 0);
            }

            .cursor {
                height:16px;
                width: 16px;
                background:#143e67;
                position: relative;
                top: 16px;
                border-radius: 50%;
                cursor: pointer;
            }

            .audio-icon {
                width: 0;
                height: 0;
                border-top: 6px solid transparent;
                border-bottom: 6px solid transparent;
                border-left: 10px solid white;
                margin-left: 13px;
                margin-top: 11px;
            }
            
            .audio-icon.audio-icon-pause {
                height: 11px;
                width: 3px;
                margin-left: 12px;
                border-right: solid 3px white;
                border-left: solid 3px white;
                background: transparent;
                border-top: transparent;
                border-bottom: transparent;
            }
            
            .audio-wrapper {
                margin-left: 16px;
                display: flex;
                align-items: center;
                width: 260px;
                height: 52px;
                color: black;
                border-radius: 6px;
                border-top: solid 1px #ededff;
                position: relative;
                overflow: hidden;
                outline: none;
                user-select: none;
                -moz-user-select: none;
            }
            
            /* Hover and selection effects for mouse */
            @media(hover: hover) and (pointer: fine) {
                .audio-wrapper {
                    cursor: pointer;
                }
                .audio-wrapper:hover {
                    background: #eeeeee;
                    transition: 0.25s;
                }
                .audio-wrapper.audio-wrapper-selected:hover {
                    background: #dddddd;
                }
                .audio-wrapper.audio-wrapper-selected {
                    background: lightblue;
                }   

                .audio-play:hover {
                    opacity: 0.8;
                }

                .volume-wrapper:hover {
                    background-color: #dfdfdf;
                }
            }
            
            /* Hover and selection for touch */
            @media (pointer: coarse) {
                /* Add background color on touch with transition */
                .audio-wrapper.audio-wrapper-selected {
                    background-color: lightblue;
                    transition: background-color 500ms cubic-bezier(0.425, 0.145, 0.840, 0.420);
                }
                .audio-wrapper {
                    background-color: transparent;
                    transition: background-color 500ms cubic-bezier(0.190, 0.455, 0.430, 0.790);
                }
            
                /* Ripple pseudo element */
                .audio-wrapper::after {
                    display: none;
                    content: '';
                    position: absolute;
                    border-radius: 50%;
                    background-color: #dddddd;
                    width: 100px;
                    height: 100px;
                    margin-top: -50px;
                    margin-left: -50px;
                    top: 50%;
                    left: 50%;
                    animation: ripple 1000ms;
                    opacity: 0;
                    z-index: 0;
                }
            
                /* Show pseudo element animation only on focus, not on click */
                .audio-wrapper:focus:not(:active)::after {
                    display: block;
                }
            
                /* Animation, scales circle and becomes transparent */
                @keyframes ripple {
                    0% {
                        opacity: 1;
                        transform: scale(0);
                    }
                    100% {
                        opacity: 0;
                        transform: scale(6);
                    }
                }    
            }`;

        return `
            <style>${styles}</style>
            <div class="canvas-wrapper">
                <canvas class="tracks-canvas" style="position:absolute; z-index:-1;"></canvas>
                <div class="audio-top">
                    <slot></slot>
                </div>
                <div class="audio-bar">
                    <div class="spacer" style="width:24px; height: 48px;"></div>
                    <div class="cursor-wrapper">
                        <div class="cursor"></div>
                    </div>
                    <div class="spacer" style="width:12px; height: 48px;"></div>
                    <div class="volume-wrapper">
                        <div class="volume-icon"></div>
                    </div>
                </div>
                <div class="time-bar">
                    <div class="time-bar-title ellipsis"></div>
                    <div class="time-bar-time">0:00 / 0:00</div>
                </div> 
            </div>`;
    }

    static trackTemplate(title, index) {
        return `
            <div class="audio-wrapper" data-index="` + index + `" tabindex="0">
                <div class="audio-title ellipsis">` + title + `</div>
                <div class="audio-play">
                    <div class="audio-icon"></div>
                </div>
            </div>`;
    }
}

customElements.define('audio-player', AudioPlayer);
