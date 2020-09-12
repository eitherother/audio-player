# audio-player

A custom UI that wraps the HTML5 audio element.


To include tracks in the player, add audio elements without controls in a ```html <div>``` inside the web component:

```html
	<audio-player>
		<div>
			<audio preload="metadata" id="track01" title="First track" src="../recordings/track01.wav"></audio>
			<audio preload="metadata" id="track02" title="Second track" src="../recordings/track02.wav"></audio>
        </div>
	</audio-player>
```