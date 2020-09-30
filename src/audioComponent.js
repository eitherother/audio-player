'use strict';

class AudioPlayer extends HTMLElement {
    constructor() {
        super();
        this.cursorBarMax = 182;
        this.muted = false;
    }

    connectedCallback() {
        // Template
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = AudioPlayer.template;

        // Load audio player for each track
        this.players = [];
        let tracks = this.tracks;
        let paths = this.paths;

        if (!tracks || !paths || !Array.isArray(tracks) || !Array.isArray(paths) || tracks.length !== paths.length) {
            console.error("Cannot load audio player, missing tracks or paths to files");
            return;
        }

        for (let [i, title] of tracks.entries()) {
            let div = document.createElement('div');
            div.innerHTML = AudioPlayer.trackTemplate(title, i);
            this.shadowRoot.querySelector('.audio-top').appendChild(div.children[0]);

            let audio = new Audio();

            let playEvent = AudioPlayer.isFirefox() ? 'canplay' : 'canplaythrough';
            audio.addEventListener(playEvent, () => {
                let wrappers = this.shadowRoot.querySelectorAll('.audio-wrapper');
                let wrapper = wrappers[i];
                wrapper.querySelector('.waiting-indicator').style.display = 'none';
            }, false);

            audio.addEventListener('error', () => {
                let wrappers = this.shadowRoot.querySelectorAll('.audio-wrapper');
                let wrapper = wrappers[i];
                wrapper.querySelector('.waiting-indicator').style.display = 'none';
                wrapper.querySelector('.audio-title').classList.add('audio-title-error');
                wrapper.querySelector('.audio-play').classList.add('audio-play-error');
                console.error("Cannot load file " + audio.src);
            }, false);

            audio.addEventListener('timeupdate', this.updateCursorFromTrack.bind(this), false);

            audio.preload = 'metadata';
            audio.src = paths[i];
            audio.load();
            this.players.push(audio);
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
            component.muted = !component.muted;
            volumeWrapper.querySelector('.volume-icon').classList.toggle('volume-icon-mute');

            if (isNaN(component.currentTrack)) {
                return;
            }

            this.players[component.currentTrack].muted = component.muted;
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
            component.shadowRoot.querySelector('.progress-amount').style.width = (100 * position / component.cursorBarMax) + '%';
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
        let currentWrapper = event.target.closest('.audio-wrapper');
        if (!currentWrapper) {
            return;
        }

        let wrappers = this.shadowRoot.querySelectorAll('.audio-wrapper');
        let currentPlayer = this.players[currentWrapper.dataset.index];

        if (!currentPlayer || currentPlayer.error || !currentPlayer.src || currentPlayer.readyState < 3) {
            return;
        }

        // indicate selection
        currentWrapper.classList.add('audio-wrapper-selected');

        if (currentPlayer.paused) {
            // turn off other audio stream if it is playing
            let oldTrack = this.currentTrack;
            this.currentTrack = parseInt(currentWrapper.dataset.index);
            if (!isNaN(oldTrack) && oldTrack !== this.currentTrack) {
                let oldWrapper = wrappers[oldTrack];
                oldWrapper.classList.remove('audio-wrapper-selected');
                oldWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
                this.players[oldWrapper.dataset.index].pause();
            }

            // reset cursor if changing or restarting track
            if (oldTrack !== this.currentTrack || Math.abs(currentPlayer.duration - currentPlayer.currentTime) < 0.001) {
                currentPlayer.currentTime = 0;
                this.updateCursorFromTrack();
                currentPlayer.onended = () => {
                    currentWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
                    this.updateCursorFromTrack(); // move cursor to end in case last update never happened
                };
            }

            // play, and set up recurring cursor updates
            currentPlayer.muted = this.muted;
            currentWrapper.querySelector('.audio-icon').classList.add('audio-icon-pause');
            this.shadowRoot.querySelector('.time-bar-title').innerText = this.tracks[this.currentTrack];
            currentPlayer.play();
        } else {
            currentPlayer.pause();
            currentWrapper.querySelector('.audio-icon').classList.remove('audio-icon-pause');
        }
    }

    holdTrack() {
        let player = this.players[this.currentTrack];
        if (!player.paused) {
            player.resumeOnRelease = true;
            player.pause();
        }
    }

    updateTrackFromCursor() {
        let cursor = this.shadowRoot.querySelector('.cursor');
        let position = (parseInt(cursor.style.left) || 0) / this.cursorBarMax;
        let player = this.players[this.currentTrack];
        if (player && position >= 0 && position <= 1) {
            player.currentTime = position * player.duration;
        }

        this.updateTime();

        if (position === 1) {
            // As of Sept 2020, some browsers (Safari, Edge) won't fire onended callback if time is manually set to the end
            player.onended();
        } else if (player.resumeOnRelease) {
            player.play();
        }

        delete player.resumeOnRelease;
    }

    updateCursorFromTrack() {
        let player = this.players[this.currentTrack];
        if (!player) {
            return;
        }

        let position = this.cursorBarMax * player.currentTime / player.duration;
        this.shadowRoot.querySelector('.cursor').style.left = position + 'px';
        this.shadowRoot.querySelector('.progress-amount').style.width = ((player.currentTime / player.duration) * 100) + "%";
        this.updateBuffer(player);
        this.updateTime();
    }

    updateTime(position) {
        function formatTime(time) {
            let minutes = Math.floor(time / 60);
            let seconds = Math.round(time % 60);
            if (seconds === 60) {
                seconds = 0;
                minutes++;
            }

            let paddedSeconds = (new Array(2).join('0') + seconds).slice(-2);
            return minutes + ':' + paddedSeconds;
        }

        let player = this.players[this.currentTrack];
        let currentTime = isNaN(position) ? player.currentTime : position * player.duration;
        let current = formatTime(currentTime);
        let total = formatTime(player.duration);
        this.shadowRoot.querySelector('.time-bar-time').innerHTML = current + ' / ' + total;
    }

    updateBuffer(audio) {
        let duration = audio.duration;
        if (duration > 0) {
            for (let i = 0; i < audio.buffered.length; i++) {
                if (audio.buffered.start(audio.buffered.length - 1 - i) <= audio.currentTime) {
                    this.shadowRoot.querySelector(".buffered-amount").style.width = (audio.buffered.end(audio.buffered.length - 1 - i) / duration) * 100 + "%";
                    break;
                }
            }
        }
    }

    static isFirefox() {
        return /Firefox/.test(navigator.userAgent);
    }

    get tracks() {
        return JSON.parse(this.getAttribute('tracks'));
    }

    get paths() {
        return JSON.parse(this.getAttribute('paths'));
    }

    static get template() {
        const styles = `
            .player-wrapper {
                margin: auto;
                position: relative;
                width: 272px;
            }

            .audio-top {
                padding-bottom: 0px;
                position: relative;
            }

            .audio-top::before {
                background-color: #143e67;
                content: '';
                height: 100%;
                left:0px;
                position: absolute;
                top:0;
                width:2px;
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
                align-items: center;
                display: flex;
                margin-left:24px;
                position: relative;
            }

            .audio-bar::before {
                content: '';
                border-left: solid 2px #143e67;
                border-bottom: solid 2px #143e67;
                height: 25px;
                left: -24px;
                position: absolute;
                top: 0px;
                width: 16px;
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
                height: 42px;
                margin-left:8px;
                position: relative;
                top: -2px;
                width: 42px;
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
                height:32px;
                width: 192px;
                padding-top: 25px;
                cursor: pointer;
                position: relative;
                -webkit-tap-highlight-color: rgba(255, 255, 255, 0);
            }

            .cursor {
                height:16px;
                width: 16px;
                background:#143e67;
                position: absolute;
                top: 18px;
                border-radius: 50%;
                cursor: pointer;
            }

            .buffered {
                height: 2px;
                position: relative;
                background: #143e67;
                width: 192px;
              }
              
              .buffered-amount {
                display: block;
                height: 100%;
                background-color: #00b3d0;
                width: 0;
              }
              
              .progress {
                margin-top: -2px;
                height: 2px;  
                position: relative;
                width: 192px;
              }
              
              .progress-amount {
                display: block;
                height: 100%;
                background-color: #ff5200;
                width: 0;
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
                align-items: center;
                border-radius: 6px;
                border-top: solid 1px #ededff;
                color: black;
                display: flex;
                height: 52px;
                margin-left: 12px;
                outline: none;
                overflow: hidden;
                position: relative;
                user-select: none;
                -moz-user-select: none;
                width: 260px;
            }
            
            .waiting-indicator {
                animation: fadeIn 0.3s ease-in 1 normal;
                background-color: #c3c3c3a6;
                height: 100%;
                position: absolute;
                width: 100%;
                z-index: 2;
            }

            @keyframes fadeIn {
                0% { opacity: 0; }
                100% { opacity: 1; }
            }

            .waiting-indicator > div {
                background-color: #d8d8d8;
                border-bottom: solid 1px #143e67;
                border-top: solid 1px #143e67;
                border-radius: 50%;
                position: absolute;
            }

            .waiting-circle-1 {
                animation: waiting 2s ease-in-out infinite normal;
                border-left: solid 2px #143e67;
                border-right: none;
                height: 32px;
                left: 112px;
                top: 10px;
                width: 32px;
            }

            .waiting-circle-2 {
                animation: waiting 2s ease-in-out infinite reverse;
                animation-delay: 1s;
                border-left: none;
                border-right: solid 2px #143e67;
                height: 24px;
                left: 116px;
                top: 14px;
                width: 24px;
            }

            @keyframes waiting {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
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
                    transition: background-color 450ms cubic-bezier(0.425, 0.145, 0.840, 0.420);
                }
                .audio-wrapper {
                    background-color: transparent;
                    transition: background-color 450ms cubic-bezier(0.190, 0.455, 0.430, 0.790);
                }
            
                /* Ripple pseudo element */
                .audio-wrapper::after {
                    background: radial-gradient(transparent, #dddddd 100%);
                    content: '';
                    position: absolute;
                    border-radius: 50%;
                    width: 100px;
                    height: 100px;
                    margin-top: -50px;
                    margin-left: -50px;
                    top: 50%;
                    left: 50%;
                    transform: scale(0);
                    opacity: 1;
                    z-index: 0;
                }
            
                /* Show pseudo element animation only on focus, not on click */
                .audio-wrapper:focus:not(:active)::after {
                    transform: scale(10);
                    opacity:0;
                    transition: 2s;
                }
            }`;

        return `
            <style>${styles}</style>
            <div class="player-wrapper">
                <div class="audio-top"></div>
                <div class="audio-bar">
                    <div class="cursor-wrapper">
                        <div class="buffered">
                            <span class="buffered-amount"></span>
                        </div>
                        <div class="progress">
                            <span class="progress-amount"></span>
                        </div>
                        <div class="cursor"></div>
                    </div>
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
                <div class="waiting-indicator">
                    <div class="waiting-circle-1"></div>
                    <div class="waiting-circle-2"></div>
                </div>
            </div>`;
    }
}

customElements.define('audio-player', AudioPlayer);
