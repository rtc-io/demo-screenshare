var SIGNALHOST = 'https://switchboard.rtc.io';
var places = require('random-name/places.json');
var quickconnect = require('rtc-quickconnect');
var attach = require('attachmediastream');
var getUserMedia = require('getusermedia');
var freeice = require('freeice');
var qsa = require('fdom/qsa');
var screenshare = require('rtc-screenshare')({
  chromeExtension: 'rtc.io screenshare',
  version: '^1.0.0'
});
var targetRoom = location.hash.slice(1);
var h = require('hyperscript');

function sendScreen(roomId) {
  var installButton = h('button.install', 'Install Extension', {
    onclick: function() {
      chrome.webstore.install();
    }
  });

  function captureScreen() {
    status();

    // remove the parent node
    if (installButton.parentNode) {
      installButton.parentNode.removeChild(installButton);
    }

    screenshare.request(function(err, constraints) {
      var input;
      if (err) {
        return console.error('Could not capture window: ', err);
      }

      console.log('attempting capture with constraints: ', constraints);
      getUserMedia(constraints, function(err, stream) {
        if (err) {
          if (screenshare.type === 'mozilla/firefox') {
            console.log('install firefox');
            var actions = document.getElementById('actions');
            return actions.appendChild(
              h('a', 'Install the Firefox extension', {
                href: './rtc-screen-capture.xpi'
              })
            );
          }
          return console.error('could not capture stream: ', err);
        }

        quickconnect(SIGNALHOST, { iceServers: freeice(), room: 'screeny:' + roomId }).addStream(stream);
        document.body.appendChild(h('div', [
          input = h('input.share', {
            type: 'text',
            value: location.href + '#' + roomId,
            readonly: 'readonly'
          })
        ]));

        input.select();
        input.focus();
      });
    });
  }

  // detect whether the screenshare plugin is available and matches
  // the required version
  screenshare.available(function(err, version) {
    var actions = document.getElementById('actions');
    if (err) {
      // on install show the capture button and remove the install button if active
      screenshare.on('activate', captureScreen);
      return actions.appendChild(installButton);
    }

    captureScreen();
  });
}

function receiveScreen(targetRoom) {
  quickconnect(SIGNALHOST, { iceServers: freeice(), room: 'screeny:' + targetRoom })
  .on('call:ended', function() {
    qsa('video').forEach(function(el) {
      el.parentNode.removeChild(el);
    });

    status('attaching to remote screen');
  })
  .on('call:started', function(id, pc) {
    status();
    pc.getRemoteStreams().map(attach).forEach(function(el) {
      document.body.appendChild(el);
    });
  });
}

function status(message) {
  document.querySelector('#status').innerText = (message || '');
}

if (targetRoom) {
  status('attaching to remote screen');
  receiveScreen(targetRoom);
}
else {
  status('waiting to share');
  sendScreen(places[Math.random() * places.length | 0].toLowerCase());
}