var SIGNALHOST = 'https://switchboard.rtc.io';
var cuid = require('cuid');
var quickconnect = require('rtc-quickconnect');
var attach = require('attachmediastream');
var getUserMedia = require('getusermedia');
var screenshare = require('rtc-screenshare')({
  chromeExtension: 'rtc.io screenshare',
  version: '^1.0.0'
});
var targetRoom = location.hash.slice(1);
var h = require('hyperscript');

function sendScreen(roomId) {
  var installButton = h('button', 'Install Extension', { onclick: function() {
    chrome.webstore.install();
  }});

  function captureScreen() {
    screenshare.request(function(err, constraints) {
      if (err) {
        return console.error('Could not capture window: ', err);
      }

      console.log('attempting capture with constraints: ', constraints);
      getUserMedia(constraints, function(err, stream) {
        if (err) {
          return console.error('could not capture stream: ', err);
        }

        quickconnect(SIGNALHOST, { room: 'screeny:' + roomId }).addStream(stream);
        document.body.appendChild(h('div', [
          h('div', 'Screen share URL:'),
          h('pre', location.href + '#' + roomId)
        ]));
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
  quickconnect(SIGNALHOST, { room: 'screeny:' + targetRoom })
  .on('call:started', function(id, pc) {
    pc.getRemoteStreams().map(attach).forEach(function(el) {
      document.body.appendChild(el);
    });
  });
}

if (targetRoom) {
  receiveScreen(targetRoom);
}
else {
  sendScreen(cuid());
}
