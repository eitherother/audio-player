# audio-player

A custom playlist-style UI that wraps the HTML5 audio element. The player implements many of the same operations available in the built-in audio controls (e.g. click and drag seek, volume on/off, track selection), but presents them in a list with more appealing custom styles. The code is encapsulated in a web component for easy reuse.

<p align="center">
    <img src="./images/player.png" width="300"/>
</p>

To include tracks in the player, add audio elements without a control attirbute in a ```<div>``` inside the web component. The ```title``` attribute indicates the title that will be shown in the rendered player and ```src``` indicates the location of the soundfile:

```html
<audio-player>
    <div>
        <audio preload="metadata" title="First track" src="./recordings/track01.wav"></audio>
        <audio preload="metadata" title="Second track" src="./recordings/track02.wav"></audio>
    </div>
</audio-player>
```

The web component should be relatively straightforward to restyle and has been tested in the latest versions (as of Sept 2020) of Chrome, Safari, Mozilla, and Edge both desktop and mobile, but there are a few limitations:
* Custom elements are not supported in many older browsers, including IE
* The audio element in mobile safari does not allow users to set the volume attribute (the assumption is that this should be controlled from the device itself)
* The volume is on/off rather than a continuous slider
