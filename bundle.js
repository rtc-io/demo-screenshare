(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{"attachmediastream":2,"fdom/qsa":4,"freeice":5,"getusermedia":9,"hyperscript":11,"random-name/places.json":15,"rtc-quickconnect":16,"rtc-screenshare":79}],2:[function(require,module,exports){
var adapter = require('webrtc-adapter-test');
module.exports = function (stream, el, options) {
    var item;
    var URL = window.URL;
    var element = el;
    var opts = {
        autoplay: true,
        mirror: false,
        muted: false,
        audio: false,
        disableContextMenu: false
    };

    if (options) {
        for (item in options) {
            opts[item] = options[item];
        }
    }

    if (!element) {
        element = document.createElement(opts.audio ? 'audio' : 'video');
    } else if (element.tagName.toLowerCase() === 'audio') {
        opts.audio = true;
    }

    if (opts.disableContextMenu) {
        element.oncontextmenu = function (e) {
            e.preventDefault();
        };
    }

    if (opts.autoplay) element.autoplay = 'autoplay';
    if (opts.muted) element.muted = true;
    if (!opts.audio && opts.mirror) {
        ['', 'moz', 'webkit', 'o', 'ms'].forEach(function (prefix) {
            var styleName = prefix ? prefix + 'Transform' : 'transform';
            element.style[styleName] = 'scaleX(-1)';
        });
    }

    adapter.attachMediaStream(element, stream);
    return element;
};

},{"webrtc-adapter-test":3}],3:[function(require,module,exports){
/*
 *  Copyright (c) 2014 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

/* More information about these options at jshint.com/docs/options */
/* jshint browser: true, camelcase: true, curly: true, devel: true,
   eqeqeq: true, forin: false, globalstrict: true, node: true,
   quotmark: single, undef: true, unused: strict */
/* global mozRTCIceCandidate, mozRTCPeerConnection, Promise,
mozRTCSessionDescription, webkitRTCPeerConnection, MediaStreamTrack */
/* exported trace,requestUserMedia */

'use strict';

var getUserMedia = null;
var attachMediaStream = null;
var reattachMediaStream = null;
var webrtcDetectedBrowser = null;
var webrtcDetectedVersion = null;
var webrtcMinimumVersion = null;
var webrtcUtils = {
  log: function() {
    // suppress console.log output when being included as a module.
    if (typeof module !== 'undefined' ||
        typeof require === 'function' && typeof define === 'function') {
      return;
    }
    console.log.apply(console, arguments);
  }
};

function trace(text) {
  // This function is used for logging.
  if (text[text.length - 1] === '\n') {
    text = text.substring(0, text.length - 1);
  }
  if (window.performance) {
    var now = (window.performance.now() / 1000).toFixed(3);
    webrtcUtils.log(now + ': ' + text);
  } else {
    webrtcUtils.log(text);
  }
}

if (typeof window === 'object') {
  if (window.HTMLMediaElement &&
    !('srcObject' in window.HTMLMediaElement.prototype)) {
    // Shim the srcObject property, once, when HTMLMediaElement is found.
    Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
      get: function() {
        // If prefixed srcObject property exists, return it.
        // Otherwise use the shimmed property, _srcObject
        return 'mozSrcObject' in this ? this.mozSrcObject : this._srcObject;
      },
      set: function(stream) {
        if ('mozSrcObject' in this) {
          this.mozSrcObject = stream;
        } else {
          // Use _srcObject as a private property for this shim
          this._srcObject = stream;
          // TODO: revokeObjectUrl(this.src) when !stream to release resources?
          this.src = URL.createObjectURL(stream);
        }
      }
    });
  }
  // Proxy existing globals
  getUserMedia = window.navigator && window.navigator.getUserMedia;
}

// Attach a media stream to an element.
attachMediaStream = function(element, stream) {
  element.srcObject = stream;
};

reattachMediaStream = function(to, from) {
  to.srcObject = from.srcObject;
};

if (typeof window === 'undefined' || !window.navigator) {
  webrtcUtils.log('This does not appear to be a browser');
  webrtcDetectedBrowser = 'not a browser';
} else if (navigator.mozGetUserMedia && window.mozRTCPeerConnection) {
  webrtcUtils.log('This appears to be Firefox');

  webrtcDetectedBrowser = 'firefox';

  // the detected firefox version.
  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1], 10);

  // the minimum firefox version still supported by adapter.
  webrtcMinimumVersion = 31;

  // The RTCPeerConnection object.
  window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    if (webrtcDetectedVersion < 38) {
      // .urls is not supported in FF < 38.
      // create RTCIceServers with a single url.
      if (pcConfig && pcConfig.iceServers) {
        var newIceServers = [];
        for (var i = 0; i < pcConfig.iceServers.length; i++) {
          var server = pcConfig.iceServers[i];
          if (server.hasOwnProperty('urls')) {
            for (var j = 0; j < server.urls.length; j++) {
              var newServer = {
                url: server.urls[j]
              };
              if (server.urls[j].indexOf('turn') === 0) {
                newServer.username = server.username;
                newServer.credential = server.credential;
              }
              newIceServers.push(newServer);
            }
          } else {
            newIceServers.push(pcConfig.iceServers[i]);
          }
        }
        pcConfig.iceServers = newIceServers;
      }
    }
    return new mozRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
  };

  // The RTCSessionDescription object.
  window.RTCSessionDescription = mozRTCSessionDescription;

  // The RTCIceCandidate object.
  window.RTCIceCandidate = mozRTCIceCandidate;

  // getUserMedia constraints shim.
  getUserMedia = function(constraints, onSuccess, onError) {
    var constraintsToFF37 = function(c) {
      if (typeof c !== 'object' || c.require) {
        return c;
      }
      var require = [];
      Object.keys(c).forEach(function(key) {
        if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
          return;
        }
        var r = c[key] = (typeof c[key] === 'object') ?
            c[key] : {ideal: c[key]};
        if (r.min !== undefined ||
            r.max !== undefined || r.exact !== undefined) {
          require.push(key);
        }
        if (r.exact !== undefined) {
          if (typeof r.exact === 'number') {
            r.min = r.max = r.exact;
          } else {
            c[key] = r.exact;
          }
          delete r.exact;
        }
        if (r.ideal !== undefined) {
          c.advanced = c.advanced || [];
          var oc = {};
          if (typeof r.ideal === 'number') {
            oc[key] = {min: r.ideal, max: r.ideal};
          } else {
            oc[key] = r.ideal;
          }
          c.advanced.push(oc);
          delete r.ideal;
          if (!Object.keys(r).length) {
            delete c[key];
          }
        }
      });
      if (require.length) {
        c.require = require;
      }
      return c;
    };
    if (webrtcDetectedVersion < 38) {
      webrtcUtils.log('spec: ' + JSON.stringify(constraints));
      if (constraints.audio) {
        constraints.audio = constraintsToFF37(constraints.audio);
      }
      if (constraints.video) {
        constraints.video = constraintsToFF37(constraints.video);
      }
      webrtcUtils.log('ff37: ' + JSON.stringify(constraints));
    }
    return navigator.mozGetUserMedia(constraints, onSuccess, onError);
  };

  navigator.getUserMedia = getUserMedia;

  // Shim for mediaDevices on older versions.
  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
      addEventListener: function() { },
      removeEventListener: function() { }
    };
  }
  navigator.mediaDevices.enumerateDevices =
      navigator.mediaDevices.enumerateDevices || function() {
    return new Promise(function(resolve) {
      var infos = [
        {kind: 'audioinput', deviceId: 'default', label: '', groupId: ''},
        {kind: 'videoinput', deviceId: 'default', label: '', groupId: ''}
      ];
      resolve(infos);
    });
  };

  if (webrtcDetectedVersion < 41) {
    // Work around http://bugzil.la/1169665
    var orgEnumerateDevices =
        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    navigator.mediaDevices.enumerateDevices = function() {
      return orgEnumerateDevices().catch(function(e) {
        if (e.name === 'NotFoundError') {
          return [];
        }
        throw e;
      });
    };
  }
} else if (navigator.webkitGetUserMedia && !!window.chrome) {
  webrtcUtils.log('This appears to be Chrome');

  webrtcDetectedBrowser = 'chrome';

  // the detected chrome version.
  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2], 10);

  // the minimum chrome version still supported by adapter.
  webrtcMinimumVersion = 38;

  // The RTCPeerConnection object.
  window.RTCPeerConnection = function(pcConfig, pcConstraints) {
    // Translate iceTransportPolicy to iceTransports,
    // see https://code.google.com/p/webrtc/issues/detail?id=4869
    if (pcConfig && pcConfig.iceTransportPolicy) {
      pcConfig.iceTransports = pcConfig.iceTransportPolicy;
    }

    var pc = new webkitRTCPeerConnection(pcConfig, pcConstraints); // jscs:ignore requireCapitalizedConstructors
    var origGetStats = pc.getStats.bind(pc);
    pc.getStats = function(selector, successCallback, errorCallback) { // jshint ignore: line
      var self = this;
      var args = arguments;

      // If selector is a function then we are in the old style stats so just
      // pass back the original getStats format to avoid breaking old users.
      if (arguments.length > 0 && typeof selector === 'function') {
        return origGetStats(selector, successCallback);
      }

      var fixChromeStats = function(response) {
        var standardReport = {};
        var reports = response.result();
        reports.forEach(function(report) {
          var standardStats = {
            id: report.id,
            timestamp: report.timestamp,
            type: report.type
          };
          report.names().forEach(function(name) {
            standardStats[name] = report.stat(name);
          });
          standardReport[standardStats.id] = standardStats;
        });

        return standardReport;
      };

      if (arguments.length >= 2) {
        var successCallbackWrapper = function(response) {
          args[1](fixChromeStats(response));
        };

        return origGetStats.apply(this, [successCallbackWrapper, arguments[0]]);
      }

      // promise-support
      return new Promise(function(resolve, reject) {
        if (args.length === 1 && selector === null) {
          origGetStats.apply(self, [
              function(response) {
                resolve.apply(null, [fixChromeStats(response)]);
              }, reject]);
        } else {
          origGetStats.apply(self, [resolve, reject]);
        }
      });
    };

    return pc;
  };

  // add promise support
  ['createOffer', 'createAnswer'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var self = this;
      if (arguments.length < 1 || (arguments.length === 1 &&
          typeof(arguments[0]) === 'object')) {
        var opts = arguments.length === 1 ? arguments[0] : undefined;
        return new Promise(function(resolve, reject) {
          nativeMethod.apply(self, [resolve, reject, opts]);
        });
      } else {
        return nativeMethod.apply(this, arguments);
      }
    };
  });

  ['setLocalDescription', 'setRemoteDescription',
      'addIceCandidate'].forEach(function(method) {
    var nativeMethod = webkitRTCPeerConnection.prototype[method];
    webkitRTCPeerConnection.prototype[method] = function() {
      var args = arguments;
      var self = this;
      return new Promise(function(resolve, reject) {
        nativeMethod.apply(self, [args[0],
            function() {
              resolve();
              if (args.length >= 2) {
                args[1].apply(null, []);
              }
            },
            function(err) {
              reject(err);
              if (args.length >= 3) {
                args[2].apply(null, [err]);
              }
            }]
          );
      });
    };
  });

  // getUserMedia constraints shim.
  var constraintsToChrome = function(c) {
    if (typeof c !== 'object' || c.mandatory || c.optional) {
      return c;
    }
    var cc = {};
    Object.keys(c).forEach(function(key) {
      if (key === 'require' || key === 'advanced' || key === 'mediaSource') {
        return;
      }
      var r = (typeof c[key] === 'object') ? c[key] : {ideal: c[key]};
      if (r.exact !== undefined && typeof r.exact === 'number') {
        r.min = r.max = r.exact;
      }
      var oldname = function(prefix, name) {
        if (prefix) {
          return prefix + name.charAt(0).toUpperCase() + name.slice(1);
        }
        return (name === 'deviceId') ? 'sourceId' : name;
      };
      if (r.ideal !== undefined) {
        cc.optional = cc.optional || [];
        var oc = {};
        if (typeof r.ideal === 'number') {
          oc[oldname('min', key)] = r.ideal;
          cc.optional.push(oc);
          oc = {};
          oc[oldname('max', key)] = r.ideal;
          cc.optional.push(oc);
        } else {
          oc[oldname('', key)] = r.ideal;
          cc.optional.push(oc);
        }
      }
      if (r.exact !== undefined && typeof r.exact !== 'number') {
        cc.mandatory = cc.mandatory || {};
        cc.mandatory[oldname('', key)] = r.exact;
      } else {
        ['min', 'max'].forEach(function(mix) {
          if (r[mix] !== undefined) {
            cc.mandatory = cc.mandatory || {};
            cc.mandatory[oldname(mix, key)] = r[mix];
          }
        });
      }
    });
    if (c.advanced) {
      cc.optional = (cc.optional || []).concat(c.advanced);
    }
    return cc;
  };

  getUserMedia = function(constraints, onSuccess, onError) {
    if (constraints.audio) {
      constraints.audio = constraintsToChrome(constraints.audio);
    }
    if (constraints.video) {
      constraints.video = constraintsToChrome(constraints.video);
    }
    webrtcUtils.log('chrome: ' + JSON.stringify(constraints));
    return navigator.webkitGetUserMedia(constraints, onSuccess, onError);
  };
  navigator.getUserMedia = getUserMedia;

  if (!navigator.mediaDevices) {
    navigator.mediaDevices = {getUserMedia: requestUserMedia,
                              enumerateDevices: function() {
      return new Promise(function(resolve) {
        var kinds = {audio: 'audioinput', video: 'videoinput'};
        return MediaStreamTrack.getSources(function(devices) {
          resolve(devices.map(function(device) {
            return {label: device.label,
                    kind: kinds[device.kind],
                    deviceId: device.id,
                    groupId: ''};
          }));
        });
      });
    }};
  }

  // A shim for getUserMedia method on the mediaDevices object.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (!navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      return requestUserMedia(constraints);
    };
  } else {
    // Even though Chrome 45 has navigator.mediaDevices and a getUserMedia
    // function which returns a Promise, it does not accept spec-style
    // constraints.
    var origGetUserMedia = navigator.mediaDevices.getUserMedia.
        bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function(c) {
      webrtcUtils.log('spec:   ' + JSON.stringify(c)); // whitespace for alignment
      c.audio = constraintsToChrome(c.audio);
      c.video = constraintsToChrome(c.video);
      webrtcUtils.log('chrome: ' + JSON.stringify(c));
      return origGetUserMedia(c);
    };
  }

  // Dummy devicechange event methods.
  // TODO(KaptenJansson) remove once implemented in Chrome stable.
  if (typeof navigator.mediaDevices.addEventListener === 'undefined') {
    navigator.mediaDevices.addEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.addEventListener called.');
    };
  }
  if (typeof navigator.mediaDevices.removeEventListener === 'undefined') {
    navigator.mediaDevices.removeEventListener = function() {
      webrtcUtils.log('Dummy mediaDevices.removeEventListener called.');
    };
  }

  // Attach a media stream to an element.
  attachMediaStream = function(element, stream) {
    if (webrtcDetectedVersion >= 43) {
      element.srcObject = stream;
    } else if (typeof element.src !== 'undefined') {
      element.src = URL.createObjectURL(stream);
    } else {
      webrtcUtils.log('Error attaching stream to element.');
    }
  };
  reattachMediaStream = function(to, from) {
    if (webrtcDetectedVersion >= 43) {
      to.srcObject = from.srcObject;
    } else {
      to.src = from.src;
    }
  };

} else if (navigator.mediaDevices && navigator.userAgent.match(
    /Edge\/(\d+).(\d+)$/)) {
  webrtcUtils.log('This appears to be Edge');
  webrtcDetectedBrowser = 'edge';

  webrtcDetectedVersion =
    parseInt(navigator.userAgent.match(/Edge\/(\d+).(\d+)$/)[2], 10);

  // the minimum version still supported by adapter.
  webrtcMinimumVersion = 12;
} else {
  webrtcUtils.log('Browser does not appear to be WebRTC-capable');
}

// Returns the result of getUserMedia as a Promise.
function requestUserMedia(constraints) {
  return new Promise(function(resolve, reject) {
    getUserMedia(constraints, resolve, reject);
  });
}

var webrtcTesting = {};
Object.defineProperty(webrtcTesting, 'version', {
  set: function(version) {
    webrtcDetectedVersion = version;
  }
});

if (typeof module !== 'undefined') {
  var RTCPeerConnection;
  if (typeof window !== 'undefined') {
    RTCPeerConnection = window.RTCPeerConnection;
  }
  module.exports = {
    RTCPeerConnection: RTCPeerConnection,
    getUserMedia: getUserMedia,
    attachMediaStream: attachMediaStream,
    reattachMediaStream: reattachMediaStream,
    webrtcDetectedBrowser: webrtcDetectedBrowser,
    webrtcDetectedVersion: webrtcDetectedVersion,
    webrtcMinimumVersion: webrtcMinimumVersion,
    webrtcTesting: webrtcTesting
    //requestUserMedia: not exposed on purpose.
    //trace: not exposed on purpose.
  };
} else if ((typeof require === 'function') && (typeof define === 'function')) {
  // Expose objects and functions when RequireJS is doing the loading.
  define([], function() {
    return {
      RTCPeerConnection: window.RTCPeerConnection,
      getUserMedia: getUserMedia,
      attachMediaStream: attachMediaStream,
      reattachMediaStream: reattachMediaStream,
      webrtcDetectedBrowser: webrtcDetectedBrowser,
      webrtcDetectedVersion: webrtcDetectedVersion,
      webrtcMinimumVersion: webrtcMinimumVersion,
      webrtcTesting: webrtcTesting
      //requestUserMedia: not exposed on purpose.
      //trace: not exposed on purpose.
    };
  });
}

},{}],4:[function(require,module,exports){
/* jshint node: true */
/* global document: false */
'use strict';

var classSelectorRE = /^\.([\w\-]+)$/;
var idSelectorRE = /^#([\w\-]+)$/;
var tagSelectorRE = /^[\w\-]+$/;

/**
  ### qsa(selector, scope?)

  This function is used to get the results of the querySelectorAll output
  in the fastest possible way.  This code is very much based on the
  implementation in
  [zepto](https://github.com/madrobby/zepto/blob/master/src/zepto.js#L104),
  but perhaps not quite as terse.

  <<< examples/qsa.js

**/
module.exports = function(selector, scope) {
  var idSearch;

  // default the element to the document
  scope = scope || document;

  // determine whether we are doing an id search or not
  idSearch = scope === document && idSelectorRE.test(selector);

  // perform the search
  return idSearch ?
    // we are doing an id search, return the element search in an array
    [scope.getElementById(RegExp.$1)] :
    // not an id search, call the appropriate selector
    Array.prototype.slice.call(
        classSelectorRE.test(selector) ?
          scope.getElementsByClassName(RegExp.$1) :
            tagSelectorRE.test(selector) ?
              scope.getElementsByTagName(selector) :
              scope.querySelectorAll(selector)
    );
};
},{}],5:[function(require,module,exports){
/* jshint node: true */
'use strict';

var normalice = require('normalice');

/**
  # freeice

  The `freeice` module is a simple way of getting random STUN or TURN server
  for your WebRTC application.  The list of servers (just STUN at this stage)
  were sourced from this [gist](https://gist.github.com/zziuni/3741933).

  ## Example Use

  The following demonstrates how you can use `freeice` with
  [rtc-quickconnect](https://github.com/rtc-io/rtc-quickconnect):

  <<< examples/quickconnect.js

  As the `freeice` module generates ice servers in a list compliant with the
  WebRTC spec you will be able to use it with raw `RTCPeerConnection`
  constructors and other WebRTC libraries.

  ## Hey, don't use my STUN/TURN server!

  If for some reason your free STUN or TURN server ends up in the
  list of servers ([stun](https://github.com/DamonOehlman/freeice/blob/master/stun.json) or
  [turn](https://github.com/DamonOehlman/freeice/blob/master/turn.json))
  that is used in this module, you can feel
  free to open an issue on this repository and those servers will be removed
  within 24 hours (or sooner).  This is the quickest and probably the most
  polite way to have something removed (and provides us some visibility
  if someone opens a pull request requesting that a server is added).

  ## Please add my server!

  If you have a server that you wish to add to the list, that's awesome! I'm
  sure I speak on behalf of a whole pile of WebRTC developers who say thanks.
  To get it into the list, feel free to either open a pull request or if you
  find that process a bit daunting then just create an issue requesting
  the addition of the server (make sure you provide all the details, and if
  you have a Terms of Service then including that in the PR/issue would be
  awesome).

  ## I know of a free server, can I add it?

  Sure, if you do your homework and make sure it is ok to use (I'm currently
  in the process of reviewing the terms of those STUN servers included from
  the original list).  If it's ok to go, then please see the previous entry
  for how to add it.

  ## Current List of Servers

  * current as at the time of last `README.md` file generation

  ### STUN

  <<< stun.json

  ### TURN

  <<< turn.json

**/

var freeice = module.exports = function(opts) {
  // if a list of servers has been provided, then use it instead of defaults
  var servers = {
    stun: (opts || {}).stun || require('./stun.json'),
    turn: (opts || {}).turn || require('./turn.json')
  };

  var stunCount = (opts || {}).stunCount || 2;
  var turnCount = (opts || {}).turnCount || 0;
  var selected;

  function getServers(type, count) {
    var out = [];
    var input = [].concat(servers[type]);
    var idx;

    while (input.length && out.length < count) {
      idx = (Math.random() * input.length) | 0;
      out = out.concat(input.splice(idx, 1));
    }

    return out.map(function(url) {
        //If it's a not a string, don't try to "normalice" it otherwise using type:url will screw it up
        if ((typeof url !== 'string') && (! (url instanceof String))) {
            return url;
        } else {
            return normalice(type + ':' + url);
        }
    });
  }

  // add stun servers
  selected = [].concat(getServers('stun', stunCount));

  if (turnCount) {
    selected = selected.concat(getServers('turn', turnCount));
  }

  return selected;
};

},{"./stun.json":7,"./turn.json":8,"normalice":6}],6:[function(require,module,exports){
/**
  # normalice

  Normalize an ice server configuration object (or plain old string) into a format
  that is usable in all browsers supporting WebRTC.  Primarily this module is designed
  to help with the transition of the `url` attribute of the configuration object to
  the `urls` attribute.

  ## Example Usage

  <<< examples/simple.js

**/

var protocols = [
  'stun:',
  'turn:'
];

module.exports = function(input) {
  var url = (input || {}).url || input;
  var protocol;
  var parts;
  var output = {};

  // if we don't have a string url, then allow the input to passthrough
  if (typeof url != 'string' && (! (url instanceof String))) {
    return input;
  }

  // trim the url string, and convert to an array
  url = url.trim();

  // if the protocol is not known, then passthrough
  protocol = protocols[protocols.indexOf(url.slice(0, 5))];
  if (! protocol) {
    return input;
  }

  // now let's attack the remaining url parts
  url = url.slice(5);
  parts = url.split('@');

  output.username = input.username;
  output.credential = input.credential;
  // if we have an authentication part, then set the credentials
  if (parts.length > 1) {
    url = parts[1];
    parts = parts[0].split(':');

    // add the output credential and username
    output.username = parts[0];
    output.credential = (input || {}).credential || parts[1] || '';
  }

  output.url = protocol + url;
  output.urls = [ output.url ];

  return output;
};

},{}],7:[function(require,module,exports){
module.exports=[
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302",
  "stun2.l.google.com:19302",
  "stun3.l.google.com:19302",
  "stun4.l.google.com:19302",
  "stun.ekiga.net",
  "stun.ideasip.com",
  "stun.schlund.de",
  "stun.stunprotocol.org:3478",
  "stun.voiparound.com",
  "stun.voipbuster.com",
  "stun.voipstunt.com",
  "stun.voxgratia.org",
  "stun.services.mozilla.com"
]

},{}],8:[function(require,module,exports){
module.exports=[]

},{}],9:[function(require,module,exports){
// getUserMedia helper by @HenrikJoreteg
var adapter = require('webrtc-adapter-test');

module.exports = function (constraints, cb) {
    var options, error;
    var haveOpts = arguments.length === 2;
    var defaultOpts = {video: true, audio: true};

    var denied = 'PermissionDeniedError';
    var altDenied = 'PERMISSION_DENIED';
    var notSatisfied = 'ConstraintNotSatisfiedError';

    // make constraints optional
    if (!haveOpts) {
        cb = constraints;
        constraints = defaultOpts;
    }

    // treat lack of browser support like an error
    if (!navigator.getUserMedia) {
        // throw proper error per spec
        error = new Error('MediaStreamError');
        error.name = 'NotSupportedError';

        // keep all callbacks async
        return window.setTimeout(function () {
            cb(error);
        }, 0);
    }

    // normalize error handling when no media types are requested
    if (!constraints.audio && !constraints.video) {
        error = new Error('MediaStreamError');
        error.name = 'NoMediaRequestedError';

        // keep all callbacks async
        return window.setTimeout(function () {
            cb(error);
        }, 0);
    }

    // testing support
    if (localStorage && localStorage.useFirefoxFakeDevice === "true") {
        constraints.fake = true;
    }

    navigator.getUserMedia(constraints, function (stream) {
        cb(null, stream);
    }, function (err) {
        var error;
        // coerce into an error object since FF gives us a string
        // there are only two valid names according to the spec
        // we coerce all non-denied to "constraint not satisfied".
        if (typeof err === 'string') {
            error = new Error('MediaStreamError');
            if (err === denied || err === altDenied) {
                error.name = denied;
            } else {
                error.name = notSatisfied;
            }
        } else {
            // if we get an error object make sure '.name' property is set
            // according to spec: http://dev.w3.org/2011/webrtc/editor/getusermedia.html#navigatorusermediaerror-and-navigatorusermediaerrorcallback
            error = err;
            if (!error.name) {
                // this is likely chrome which
                // sets a property called "ERROR_DENIED" on the error object
                // if so we make sure to set a name
                if (error[denied]) {
                    err.name = denied;
                } else {
                    err.name = notSatisfied;
                }
            }
        }

        cb(error);
    });
};

},{"webrtc-adapter-test":10}],10:[function(require,module,exports){
arguments[4][3][0].apply(exports,arguments)
},{"dup":3}],11:[function(require,module,exports){
var split = require('browser-split')
var ClassList = require('class-list')
require('html-element')

function context () {

  var cleanupFuncs = []

  function h() {
    var args = [].slice.call(arguments), e = null
    function item (l) {
      var r
      function parseClass (string) {
        var m = split(string, /([\.#]?[a-zA-Z0-9_:-]+)/)
        if(/^\.|#/.test(m[1]))
          e = document.createElement('div')
        forEach(m, function (v) {
          var s = v.substring(1,v.length)
          if(!v) return
          if(!e)
            e = document.createElement(v)
          else if (v[0] === '.')
            ClassList(e).add(s)
          else if (v[0] === '#')
            e.setAttribute('id', s)
        })
      }

      if(l == null)
        ;
      else if('string' === typeof l) {
        if(!e)
          parseClass(l)
        else
          e.appendChild(r = document.createTextNode(l))
      }
      else if('number' === typeof l
        || 'boolean' === typeof l
        || l instanceof Date
        || l instanceof RegExp ) {
          e.appendChild(r = document.createTextNode(l.toString()))
      }
      //there might be a better way to handle this...
      else if (isArray(l))
        forEach(l, item)
      else if(isNode(l))
        e.appendChild(r = l)
      else if(l instanceof Text)
        e.appendChild(r = l)
      else if ('object' === typeof l) {
        for (var k in l) {
          if('function' === typeof l[k]) {
            if(/^on\w+/.test(k)) {
              (function (k, l) { // capture k, l in the closure
                if (e.addEventListener){
                  e.addEventListener(k.substring(2), l[k], false)
                  cleanupFuncs.push(function(){
                    e.removeEventListener(k.substring(2), l[k], false)
                  })
                }else{
                  e.attachEvent(k, l[k])
                  cleanupFuncs.push(function(){
                    e.detachEvent(k, l[k])
                  })
                }
              })(k, l)
            } else {
              // observable
              e[k] = l[k]()
              cleanupFuncs.push(l[k](function (v) {
                e[k] = v
              }))
            }
          }
          else if(k === 'style') {
            if('string' === typeof l[k]) {
              e.style.cssText = l[k]
            }else{
              for (var s in l[k]) (function(s, v) {
                if('function' === typeof v) {
                  // observable
                  e.style.setProperty(s, v())
                  cleanupFuncs.push(v(function (val) {
                    e.style.setProperty(s, val)
                  }))
                } else
                  e.style.setProperty(s, l[k][s])
              })(s, l[k][s])
            }
          } else if (k.substr(0, 5) === "data-") {
            e.setAttribute(k, l[k])
          } else {
            e[k] = l[k]
          }
        }
      } else if ('function' === typeof l) {
        //assume it's an observable!
        var v = l()
        e.appendChild(r = isNode(v) ? v : document.createTextNode(v))

        cleanupFuncs.push(l(function (v) {
          if(isNode(v) && r.parentElement)
            r.parentElement.replaceChild(v, r), r = v
          else
            r.textContent = v
        }))
      }

      return r
    }
    while(args.length)
      item(args.shift())

    return e
  }

  h.cleanup = function () {
    for (var i = 0; i < cleanupFuncs.length; i++){
      cleanupFuncs[i]()
    }
    cleanupFuncs.length = 0
  }

  return h
}

var h = module.exports = context()
h.context = context

function isNode (el) {
  return el && el.nodeName && el.nodeType
}

function isText (el) {
  return el && el.nodeName === '#text' && el.nodeType == 3
}

function forEach (arr, fn) {
  if (arr.forEach) return arr.forEach(fn)
  for (var i = 0; i < arr.length; i++) fn(arr[i], i)
}

function isArray (arr) {
  return Object.prototype.toString.call(arr) == '[object Array]'
}

},{"browser-split":12,"class-list":13,"html-element":92}],12:[function(require,module,exports){
/*!
 * Cross-Browser Split 1.1.1
 * Copyright 2007-2012 Steven Levithan <stevenlevithan.com>
 * Available under the MIT License
 * ECMAScript compliant, uniform cross-browser split method
 */

/**
 * Splits a string into an array of strings using a regex or string separator. Matches of the
 * separator are not included in the result array. However, if `separator` is a regex that contains
 * capturing groups, backreferences are spliced into the result each time `separator` is matched.
 * Fixes browser bugs compared to the native `String.prototype.split` and can be used reliably
 * cross-browser.
 * @param {String} str String to split.
 * @param {RegExp|String} separator Regex or string to use for separating the string.
 * @param {Number} [limit] Maximum number of items to include in the result array.
 * @returns {Array} Array of substrings.
 * @example
 *
 * // Basic use
 * split('a b c d', ' ');
 * // -> ['a', 'b', 'c', 'd']
 *
 * // With limit
 * split('a b c d', ' ', 2);
 * // -> ['a', 'b']
 *
 * // Backreferences in result array
 * split('..word1 word2..', /([a-z]+)(\d+)/i);
 * // -> ['..', 'word', '1', ' ', 'word', '2', '..']
 */
module.exports = (function split(undef) {

  var nativeSplit = String.prototype.split,
    compliantExecNpcg = /()??/.exec("")[1] === undef,
    // NPCG: nonparticipating capturing group
    self;

  self = function(str, separator, limit) {
    // If `separator` is not a regex, use `nativeSplit`
    if (Object.prototype.toString.call(separator) !== "[object RegExp]") {
      return nativeSplit.call(str, separator, limit);
    }
    var output = [],
      flags = (separator.ignoreCase ? "i" : "") + (separator.multiline ? "m" : "") + (separator.extended ? "x" : "") + // Proposed for ES6
      (separator.sticky ? "y" : ""),
      // Firefox 3+
      lastLastIndex = 0,
      // Make `global` and avoid `lastIndex` issues by working with a copy
      separator = new RegExp(separator.source, flags + "g"),
      separator2, match, lastIndex, lastLength;
    str += ""; // Type-convert
    if (!compliantExecNpcg) {
      // Doesn't need flags gy, but they don't hurt
      separator2 = new RegExp("^" + separator.source + "$(?!\\s)", flags);
    }
    /* Values for `limit`, per the spec:
     * If undefined: 4294967295 // Math.pow(2, 32) - 1
     * If 0, Infinity, or NaN: 0
     * If positive number: limit = Math.floor(limit); if (limit > 4294967295) limit -= 4294967296;
     * If negative number: 4294967296 - Math.floor(Math.abs(limit))
     * If other: Type-convert, then use the above rules
     */
    limit = limit === undef ? -1 >>> 0 : // Math.pow(2, 32) - 1
    limit >>> 0; // ToUint32(limit)
    while (match = separator.exec(str)) {
      // `separator.lastIndex` is not reliable cross-browser
      lastIndex = match.index + match[0].length;
      if (lastIndex > lastLastIndex) {
        output.push(str.slice(lastLastIndex, match.index));
        // Fix browsers whose `exec` methods don't consistently return `undefined` for
        // nonparticipating capturing groups
        if (!compliantExecNpcg && match.length > 1) {
          match[0].replace(separator2, function() {
            for (var i = 1; i < arguments.length - 2; i++) {
              if (arguments[i] === undef) {
                match[i] = undef;
              }
            }
          });
        }
        if (match.length > 1 && match.index < str.length) {
          Array.prototype.push.apply(output, match.slice(1));
        }
        lastLength = match[0].length;
        lastLastIndex = lastIndex;
        if (output.length >= limit) {
          break;
        }
      }
      if (separator.lastIndex === match.index) {
        separator.lastIndex++; // Avoid an infinite loop
      }
    }
    if (lastLastIndex === str.length) {
      if (lastLength || !separator.test("")) {
        output.push("");
      }
    } else {
      output.push(str.slice(lastLastIndex));
    }
    return output.length > limit ? output.slice(0, limit) : output;
  };

  return self;
})();

},{}],13:[function(require,module,exports){
// contains, add, remove, toggle
var indexof = require('indexof')

module.exports = ClassList

function ClassList(elem) {
    var cl = elem.classList

    if (cl) {
        return cl
    }

    var classList = {
        add: add
        , remove: remove
        , contains: contains
        , toggle: toggle
        , toString: $toString
        , length: 0
        , item: item
    }

    return classList

    function add(token) {
        var list = getTokens()
        if (indexof(list, token) > -1) {
            return
        }
        list.push(token)
        setTokens(list)
    }

    function remove(token) {
        var list = getTokens()
            , index = indexof(list, token)

        if (index === -1) {
            return
        }

        list.splice(index, 1)
        setTokens(list)
    }

    function contains(token) {
        return indexof(getTokens(), token) > -1
    }

    function toggle(token) {
        if (contains(token)) {
            remove(token)
            return false
        } else {
            add(token)
            return true
        }
    }

    function $toString() {
        return elem.className
    }

    function item(index) {
        var tokens = getTokens()
        return tokens[index] || null
    }

    function getTokens() {
        var className = elem.className

        return filter(className.split(" "), isTruthy)
    }

    function setTokens(list) {
        var length = list.length

        elem.className = list.join(" ")
        classList.length = length

        for (var i = 0; i < list.length; i++) {
            classList[i] = list[i]
        }

        delete list[length]
    }
}

function filter (arr, fn) {
    var ret = []
    for (var i = 0; i < arr.length; i++) {
        if (fn(arr[i])) ret.push(arr[i])
    }
    return ret
}

function isTruthy(value) {
    return !!value
}

},{"indexof":14}],14:[function(require,module,exports){

var indexOf = [].indexOf;

module.exports = function(arr, obj){
  if (indexOf) return arr.indexOf(obj);
  for (var i = 0; i < arr.length; ++i) {
    if (arr[i] === obj) return i;
  }
  return -1;
};
},{}],15:[function(require,module,exports){
module.exports=[
"Aaronsburg"
,
"Abbeville"
,
"Abbotsford"
,
"Abbottstown"
,
"Abbyville"
,
"Abell"
,
"Abercrombie"
,
"Abernant"
,
"Abilene"
,
"Abingdon"
,
"Abington"
,
"Abiquiu"
,
"Abrams"
,
"Absaraka"
,
"Absarokee"
,
"Absecon"
,
"Acampo"
,
"Accokeek"
,
"Accomac"
,
"Accoville"
,
"Achille"
,
"Ackerly"
,
"Ackermanville"
,
"Ackworth"
,
"Acosta"
,
"Acra"
,
"Acushnet"
,
"Acworth"
,
"Adah"
,
"Adairsville"
,
"Adairville"
,
"Adamsbasin"
,
"Adamsburg"
,
"Adamstown"
,
"Adamsville"
,
"Addieville"
,
"Addington"
,
"Addy"
,
"Addyston"
,
"Adel"
,
"Adelanto"
,
"Adell"
,
"Adelphi"
,
"Adelphia"
,
"Adena"
,
"Adger"
,
"Adin"
,
"Adjuntas"
,
"Adna"
,
"Adona"
,
"Aflex"
,
"Afton"
,
"Agana"
,
"Agar"
,
"Agawam"
,
"Agness"
,
"Agra"
,
"Aguada"
,
"Aguadilla"
,
"Aguadulce"
,
"Aguanga"
,
"Aguila"
,
"Aguilar"
,
"Aguirre"
,
"Ahgwahching"
,
"Ahmeek"
,
"Ahoskie"
,
"Ahsahka"
,
"Ahwahnee"
,
"Aibonito"
,
"Aiea"
,
"Ailey"
,
"Aimwell"
,
"Ainsworth"
,
"Airville"
,
"Aitkin"
,
"Ajo"
,
"Akaska"
,
"Akeley"
,
"Akiachak"
,
"Akiak"
,
"Akutan"
,
"Alachua"
,
"Aladdin"
,
"Alakanuk"
,
"Alamance"
,
"Alamogordo"
,
"Alamosa"
,
"Alamota"
,
"Alanreed"
,
"Alanson"
,
"Alapaha"
,
"Albee"
,
"Albemarle"
,
"Albers"
,
"Albertlea"
,
"Alberton"
,
"Albertson"
,
"Albertville"
,
"Albia"
,
"Albin"
,
"Albion"
,
"Alborn"
,
"Alburg"
,
"Alburnett"
,
"Alburtis"
,
"Alcalde"
,
"Alcester"
,
"Alco"
,
"Alcolu"
,
"Alcova"
,
"Alda"
,
"Aldenville"
,
"Alderson"
,
"Aldie"
,
"Aledo"
,
"Aleknagik"
,
"Aleppo"
,
"Alford"
,
"Algoma"
,
"Algona"
,
"Algonac"
,
"Aliceville"
,
"Alief"
,
"Aline"
,
"Aliquippa"
,
"Alix"
,
"Alkabo"
,
"Alkol"
,
"Allamuchy"
,
"Allardt"
,
"Alledonia"
,
"Alleene"
,
"Allegan"
,
"Allegany"
,
"Alleghany"
,
"Allegre"
,
"Alleman"
,
"Allendale"
,
"Allendorf"
,
"Allenhurst"
,
"Allenport"
,
"Allensville"
,
"Allenton"
,
"Allenwood"
,
"Allerton"
,
"Allgood"
,
"Allock"
,
"Allons"
,
"Allouez"
,
"Alloway"
,
"Allport"
,
"Allred"
,
"Almena"
,
"Almira"
,
"Almo"
,
"Almont"
,
"Almyra"
,
"Alna"
,
"Alpaugh"
,
"Alpena"
,
"Alpharetta"
,
"Alpoca"
,
"Alsea"
,
"Alsen"
,
"Alsey"
,
"Alstead"
,
"Alston"
,
"Alta"
,
"Altadena"
,
"Altaloma"
,
"Altamahaw"
,
"Altamont"
,
"Altenburg"
,
"Altha"
,
"Altheimer"
,
"Altmar"
,
"Altona"
,
"Altoona"
,
"Altro"
,
"Altura"
,
"Alturas"
,
"Altus"
,
"Alumbank"
,
"Alvada"
,
"Alvadore"
,
"Alvarado"
,
"Alvaton"
,
"Alverda"
,
"Alverton"
,
"Alviso"
,
"Alvo"
,
"Alvord"
,
"Alvordton"
,
"Alvy"
,
"Alzada"
,
"Amado"
,
"Amagansett"
,
"Amagon"
,
"Amalia"
,
"Amana"
,
"Amanda"
,
"Amasa"
,
"Amawalk"
,
"Amazonia"
,
"Amberg"
,
"Amberson"
,
"Ambia"
,
"Ambler"
,
"Amboy"
,
"Amburgey"
,
"Ameagle"
,
"Amenia"
,
"Americus"
,
"Amery"
,
"Amesbury"
,
"Amesville"
,
"Amherstdale"
,
"Amidon"
,
"Amiret"
,
"Amissville"
,
"Amistad"
,
"Amite"
,
"Amityville"
,
"Amlin"
,
"Amma"
,
"Amo"
,
"Amonate"
,
"Amoret"
,
"Amorita"
,
"Amory"
,
"Amsden"
,
"Amston"
,
"Anacoco"
,
"Anacortes"
,
"Anadarko"
,
"Anahola"
,
"Anahuac"
,
"Analomink"
,
"Anamoose"
,
"Anamosa"
,
"Anasco"
,
"Anatone"
,
"Anawalt"
,
"Anchorville"
,
"Anco"
,
"Ancona"
,
"Ancram"
,
"Ancramdale"
,
"Andale"
,
"Andalusia"
,
"Andersonville"
,
"Andreas"
,
"Aneta"
,
"Aneth"
,
"Angier"
,
"Angleinlet"
,
"Angleton"
,
"Anguilla"
,
"Angwin"
,
"Aniak"
,
"Animas"
,
"Aniwa"
,
"Ankeny"
,
"Anmoore"
,
"Annada"
,
"Annamaria"
,
"Annandale"
,
"Annarbor"
,
"Annawan"
,
"Annemanie"
,
"Anniston"
,
"Annona"
,
"Annville"
,
"Anoka"
,
"Ansley"
,
"Anson"
,
"Ansonia"
,
"Ansonville"
,
"Ansted"
,
"Antesfort"
,
"Anthon"
,
"Antigo"
,
"Antlers"
,
"Antonchico"
,
"Antonito"
,
"Antrim"
,
"Anvik"
,
"Anza"
,
"Apalachicola"
,
"Apalachin"
,
"Apison"
,
"Aplington"
,
"Apopka"
,
"Appling"
,
"Appomattox"
,
"Aptos"
,
"Aquasco"
,
"Aquashicola"
,
"Aquebogue"
,
"Aquilla"
,
"Aquone"
,
"Arabi"
,
"Aragon"
,
"Arapaho"
,
"Arapahoe"
,
"Ararat"
,
"Arbela"
,
"Arboles"
,
"Arbon"
,
"Arbovale"
,
"Arbuckle"
,
"Arbyrd"
,
"Arcanum"
,
"Arcata"
,
"Archbald"
,
"Archbold"
,
"Archcape"
,
"Archie"
,
"Arco"
,
"Arcola"
,
"Ardara"
,
"Ardenvoir"
,
"Ardmore"
,
"Ardoch"
,
"Ardsley"
,
"Arecibo"
,
"Aredale"
,
"Arendtsville"
,
"Arenzville"
,
"Argenta"
,
"Argillite"
,
"Argo"
,
"Argonia"
,
"Argos"
,
"Argusville"
,
"Argyle"
,
"Ariel"
,
"Arimo"
,
"Arion"
,
"Aripeka"
,
"Arispe"
,
"Aristes"
,
"Ariton"
,
"Arivaca"
,
"Arjay"
,
"Arkabutla"
,
"Arkadelphia"
,
"Arkansaw"
,
"Arkdale"
,
"Arkoma"
,
"Arkport"
,
"Arkville"
,
"Arlee"
,
"Arley"
,
"Arma"
,
"Armagh"
,
"Armbrust"
,
"Armington"
,
"Armona"
,
"Armorel"
,
"Armuchee"
,
"Arnaudville"
,
"Arnegard"
,
"Arnett"
,
"Arnoldsburg"
,
"Arnoldsville"
,
"Arnot"
,
"Arock"
,
"Aroda"
,
"Aromas"
,
"Arona"
,
"Arp"
,
"Arpin"
,
"Arrey"
,
"Arriba"
,
"Arrington"
,
"Arrowsmith"
,
"Artas"
,
"Artemas"
,
"Artemus"
,
"Artesia"
,
"Artesian"
,
"Arthurdale"
,
"Artois"
,
"Arvada"
,
"Arvilla"
,
"Arvin"
,
"Arvonia"
,
"Ary"
,
"Asbury"
,
"Asco"
,
"Ascutney"
,
"Ashaway"
,
"Ashburn"
,
"Ashburnham"
,
"Ashby"
,
"Ashdown"
,
"Asheboro"
,
"Asherton"
,
"Ashfield"
,
"Ashford"
,
"Ashippun"
,
"Ashkum"
,
"Ashmore"
,
"Ashtabula"
,
"Ashton"
,
"Ashuelot"
,
"Ashville"
,
"Ashwood"
,
"Askov"
,
"Asotin"
,
"Aspermont"
,
"Aspers"
,
"Assaria"
,
"Assawoman"
,
"Assonet"
,
"Astatula"
,
"Atalissa"
,
"Atascadero"
,
"Atascosa"
,
"Atco"
,
"Atglen"
,
"Athelstane"
,
"Athol"
,
"Atlasburg"
,
"Atmore"
,
"Atoka"
,
"Attalla"
,
"Attapulgus"
,
"Attleboro"
,
"Auberry"
,
"Auburndale"
,
"Auburntown"
,
"Augres"
,
"Aulander"
,
"Ault"
,
"Aultman"
,
"Aumsville"
,
"Aurelia"
,
"Austell"
,
"Austerlitz"
,
"Austinburg"
,
"Austinville"
,
"Austwell"
,
"Autaugaville"
,
"Autrain"
,
"Autryville"
,
"Auxier"
,
"Auxvasse"
,
"Ava"
,
"Avalon"
,
"Avant"
,
"Avawam"
,
"Avella"
,
"Avenal"
,
"Avenel"
,
"Avera"
,
"Avilla"
,
"Avinger"
,
"Aviston"
,
"Avoca"
,
"Avondale"
,
"Avonmore"
,
"Awendaw"
,
"Axson"
,
"Axtel"
,
"Axtell"
,
"Axton"
,
"Ayden"
,
"Aydlett"
,
"Ayer"
,
"Aylett"
,
"Aynor"
,
"Ayr"
,
"Ayrshire"
,
"Azalia"
,
"Azle"
,
"Azusa"
,
"Babb"
,
"Bache"
,
"Backus"
,
"Bacliff"
,
"Baconton"
,
"Bacova"
,
"Badaxe"
,
"Badger"
,
"Badin"
,
"Bagdad"
,
"Baggs"
,
"Bagwell"
,
"Baileyton"
,
"Baileyville"
,
"Bains"
,
"Bainville"
,
"Bairdford"
,
"Bairoil"
,
"Baisden"
,
"Bajadero"
,
"Baker"
,
"Bakerstown"
,
"Bakersville"
,
"Bakerton"
,
"Bakewell"
,
"Bala"
,
"Balaton"
,
"Balch"
,
"Baldwinsville"
,
"Baldwinville"
,
"Baldwyn"
,
"Balko"
,
"Ballantine"
,
"Ballengee"
,
"Ballentine"
,
"Ballico"
,
"Ballinger"
,
"Ballouville"
,
"Ballwin"
,
"Bally"
,
"Balmat"
,
"Balmorhea"
,
"Balta"
,
"Bamberg"
,
"Banco"
,
"Bancroft"
,
"Bandana"
,
"Bandera"
,
"Bandon"
,
"Bandytown"
,
"Bangall"
,
"Bangs"
,
"Bankston"
,
"Banner"
,
"Banning"
,
"Bannister"
,
"Bannock"
,
"Banquete"
,
"Bantry"
,
"Baptistown"
,
"Baraboo"
,
"Baraga"
,
"Barataria"
,
"Barbeau"
,
"Barberton"
,
"Barberville"
,
"Barboursville"
,
"Barbourville"
,
"Barceloneta"
,
"Barco"
,
"Bardolph"
,
"Bardstown"
,
"Bardwell"
,
"Bargersville"
,
"Barhamsville"
,
"Baring"
,
"Barker"
,
"Barksdale"
,
"Barling"
,
"Barnardsville"
,
"Barnegat"
,
"Barnesboro"
,
"Barneston"
,
"Barnesville"
,
"Barneveld"
,
"Barnhart"
,
"Barnsdall"
,
"Barnstable"
,
"Barnstead"
,
"Barnum"
,
"Barnwell"
,
"Baroda"
,
"Barrackville"
,
"Barranquitas"
,
"Barree"
,
"Barron"
,
"Barronett"
,
"Barryton"
,
"Barrytown"
,
"Barryville"
,
"Bartelso"
,
"Bartlesville"
,
"Bartley"
,
"Barto"
,
"Bartonsville"
,
"Bartow"
,
"Barwick"
,
"Basco"
,
"Bascom"
,
"Basehor"
,
"Basile"
,
"Baskerville"
,
"Baskett"
,
"Baskin"
,
"Basom"
,
"Bassfield"
,
"Bastian"
,
"Bastrop"
,
"Basye"
,
"Batchelor"
,
"Batchtown"
,
"Batesburg"
,
"Batesland"
,
"Batesville"
,
"Batson"
,
"Battiest"
,
"Battleboro"
,
"Battletown"
,
"Baudette"
,
"Bausman"
,
"Bavon"
,
"Baxley"
,
"Bayamon"
,
"Bayard"
,
"Bayboro"
,
"Bayfield"
,
"Baylis"
,
"Bayminette"
,
"Bayougoula"
,
"Baypines"
,
"Bays"
,
"Bayshore"
,
"Bayside"
,
"Baytown"
,
"Bayview"
,
"Bayville"
,
"Bazine"
,
"Beachwood"
,
"Beaconsfield"
,
"Bealeton"
,
"Beallsville"
,
"Beals"
,
"Beaman"
,
"Bearden"
,
"Beardstown"
,
"Bearsville"
,
"Beasley"
,
"Beason"
,
"Beattie"
,
"Beatty"
,
"Beattyville"
,
"Beaufort"
,
"Beaverdale"
,
"Beaverlett"
,
"Beaverton"
,
"Beavertown"
,
"Beaverville"
,
"Bebe"
,
"Beccaria"
,
"Bechtelsville"
,
"Beckemeyer"
,
"Beckley"
,
"Beckville"
,
"Beckwith"
,
"Bedias"
,
"Bedminster"
,
"Beechbottom"
,
"Beecher"
,
"Beechmont"
,
"Beedeville"
,
"Beehouse"
,
"Beeler"
,
"Beemer"
,
"Beeson"
,
"Beetown"
,
"Beeville"
,
"Beggs"
,
"Beirne"
,
"Bejou"
,
"Belair"
,
"Belalton"
,
"Belcher"
,
"Belchertown"
,
"Belcourt"
,
"Belden"
,
"Beldenville"
,
"Belding"
,
"Belen"
,
"Belfair"
,
"Belfield"
,
"Belford"
,
"Belington"
,
"Belk"
,
"Belknap"
,
"Bellaire"
,
"Bellarthur"
,
"Bellbrook"
,
"Bellbuckle"
,
"Bellechasse"
,
"Bellefonte"
,
"Bellemead"
,
"Bellemina"
,
"Belleplaine"
,
"Bellerive"
,
"Bellerose"
,
"Bellevernon"
,
"Belleview"
,
"Belleville"
,
"Bellevue"
,
"Bellmont"
,
"Bellmore"
,
"Bellona"
,
"Bellport"
,
"Bells"
,
"Bellvale"
,
"Bellville"
,
"Bellvue"
,
"Bellwood"
,
"Belmar"
,
"Belmond"
,
"Belpre"
,
"Belsano"
,
"Belton"
,
"Beltrami"
,
"Belva"
,
"Belvedere"
,
"Belview"
,
"Belvue"
,
"Belzoni"
,
"Bement"
,
"Bemidji"
,
"Bena"
,
"Benarnold"
,
"Benavides"
,
"Bendena"
,
"Bendersville"
,
"Benedicta"
,
"Benezett"
,
"Benge"
,
"Benham"
,
"Benhur"
,
"Benicia"
,
"Benkelman"
,
"Benld"
,
"Benlomond"
,
"Bennet"
,
"Bennettsville"
,
"Benoit"
,
"Bensalem"
,
"Bensenville"
,
"Bentleyville"
,
"Bentonia"
,
"Bentonville"
,
"Bentree"
,
"Benwood"
,
"Benzonia"
,
"Beowawe"
,
"Berclair"
,
"Bergenfield"
,
"Berger"
,
"Bergholz"
,
"Bergoo"
,
"Bergton"
,
"Berkey"
,
"Berkley"
,
"Bernalillo"
,
"Bernardston"
,
"Bernardsville"
,
"Bernville"
,
"Beroun"
,
"Berrysburg"
,
"Berryton"
,
"Berryville"
,
"Berthold"
,
"Berthoud"
,
"Berwind"
,
"Berwyn"
,
"Bethalto"
,
"Bethania"
,
"Bethanna"
,
"Bethany"
,
"Bethera"
,
"Bethpage"
,
"Bethune"
,
"Bettendorf"
,
"Betterton"
,
"Bettsville"
,
"Beulah"
,
"Beulaville"
,
"Bevier"
,
"Bevington"
,
"Bevinsville"
,
"Bexar"
,
"Beyer"
,
"Bickleton"
,
"Bickmore"
,
"Bicknell"
,
"Biddeford"
,
"Biddle"
,
"Bidwell"
,
"Bieber"
,
"Bienville"
,
"Billerica"
,
"Billingsley"
,
"Biloxi"
,
"Bim"
,
"Bimble"
,
"Binford"
,
"Bingen"
,
"Binger"
,
"Biola"
,
"Bippus"
,
"Birchdale"
,
"Birchleaf"
,
"Birchrunville"
,
"Birchtree"
,
"Birchwood"
,
"Birdeye"
,
"Birdinhand"
,
"Birds"
,
"Birdsboro"
,
"Birdseye"
,
"Birnamwood"
,
"Birney"
,
"Birome"
,
"Bisbee"
,
"Biscoe"
,
"Bishopville"
,
"Bitely"
,
"Bittinger"
,
"Bivins"
,
"Biwabik"
,
"Bixby"
,
"Blachly"
,
"Blackduck"
,
"Blackey"
,
"Blackfoot"
,
"Blackford"
,
"Blackhawk"
,
"Blacklick"
,
"Blacksburg"
,
"Blackshear"
,
"Blackstock"
,
"Blacksville"
,
"Blackville"
,
"Blackwater"
,
"Blackwood"
,
"Bladen"
,
"Bladenboro"
,
"Bladensburg"
,
"Blain"
,
"Blairs"
,
"Blairsburg"
,
"Blairsden"
,
"Blairstown"
,
"Blairsville"
,
"Blaisdell"
,
"Blakely"
,
"Blakesburg"
,
"Blakeslee"
,
"Blanca"
,
"Blanchester"
,
"Blanco"
,
"Blandburg"
,
"Blandford"
,
"Blandinsville"
,
"Blandon"
,
"Blandville"
,
"Blanford"
,
"Blanks"
,
"Blauvelt"
,
"Blawenburg"
,
"Bledsoe"
,
"Bleiblerville"
,
"Blencoe"
,
"Blenker"
,
"Blessing"
,
"Blevins"
,
"Blissfield"
,
"Blocker"
,
"Blocksburg"
,
"Blockton"
,
"Blodgett"
,
"Blomkest"
,
"Bloomburg"
,
"Bloomdale"
,
"Bloomer"
,
"Bloomery"
,
"Bloomingburg"
,
"Bloomingdale"
,
"Bloomingrose"
,
"Bloomsburg"
,
"Bloomsbury"
,
"Bloomsdale"
,
"Bloomville"
,
"Blossburg"
,
"Blossvale"
,
"Blount"
,
"Blountstown"
,
"Blountsville"
,
"Blountville"
,
"Bloxom"
,
"Blueball"
,
"Bluebell"
,
"Blueeye"
,
"Bluefield"
,
"Bluehole"
,
"Bluejay"
,
"Bluemont"
,
"Bluewater"
,
"Bluffdale"
,
"Bluffs"
,
"Bluffton"
,
"Bluford"
,
"Bly"
,
"Blythedale"
,
"Blytheville"
,
"Blythewood"
,
"Boalsburg"
,
"Boardman"
,
"Boaz"
,
"Bobtown"
,
"Bobwhite"
,
"Bodega"
,
"Bodfish"
,
"Boelus"
,
"Boerne"
,
"Bogalusa"
,
"Bogard"
,
"Bogart"
,
"Bogata"
,
"Boggs"
,
"Boggstown"
,
"Bogue"
,
"Boguechitto"
,
"Bohannon"
,
"Boiceville"
,
"Boisdarc"
,
"Boissevain"
,
"Bokchito"
,
"Bokeelia"
,
"Bokoshe"
,
"Bolckow"
,
"Boles"
,
"Boley"
,
"Boligee"
,
"Bolinas"
,
"Boling"
,
"Bolingbroke"
,
"Bolinger"
,
"Bomont"
,
"Bomoseen"
,
"Bonair"
,
"Bonaire"
,
"Bonaqua"
,
"Boncarbo"
,
"Bondsville"
,
"Bonduel"
,
"Bondurant"
,
"Bondville"
,
"Bonesteel"
,
"Boneville"
,
"Bonfield"
,
"Bonham"
,
"Bonifay"
,
"Bonita"
,
"Bonlee"
,
"Bonneau"
,
"Bonner"
,
"Bonnerdale"
,
"Bonneterre"
,
"Bonnieville"
,
"Bonnyman"
,
"Bono"
,
"Bonsall"
,
"Bonsecour"
,
"Bonwier"
,
"Boody"
,
"Booker"
,
"Boomer"
,
"Booneville"
,
"Boonsboro"
,
"Boonton"
,
"Boonville"
,
"Boothville"
,
"Boqueron"
,
"Bordelonville"
,
"Bordentown"
,
"Bordulac"
,
"Borger"
,
"Boring"
,
"Borup"
,
"Boscobel"
,
"Bosler"
,
"Bosque"
,
"Bostic"
,
"Bostwick"
,
"Bosworth"
,
"Bothell"
,
"Botkins"
,
"Botsford"
,
"Bottineau"
,
"Bouckville"
,
"Boundbrook"
,
"Bountiful"
,
"Bourbonnais"
,
"Bourg"
,
"Bourneville"
,
"Bouse"
,
"Bouton"
,
"Boutte"
,
"Bovard"
,
"Bovey"
,
"Bovill"
,
"Bovina"
,
"Bowbells"
,
"Bowden"
,
"Bowdle"
,
"Bowdoinham"
,
"Bowdon"
,
"Bowers"
,
"Bowerston"
,
"Bowersville"
,
"Bowlegs"
,
"Bowler"
,
"Bowlus"
,
"Bowmansdale"
,
"Bowmanstown"
,
"Bowmansville"
,
"Boxelder"
,
"Boxford"
,
"Boxholm"
,
"Boyceville"
,
"Boyden"
,
"Boyds"
,
"Boydton"
,
"Boyers"
,
"Boyertown"
,
"Boyes"
,
"Boykin"
,
"Boykins"
,
"Boynton"
,
"Boystown"
,
"Bozeman"
,
"Bozman"
,
"Bozoo"
,
"Bozrah"
,
"Braceville"
,
"Bracey"
,
"Brackettville"
,
"Brackney"
,
"Braddock"
,
"Braddyville"
,
"Braden"
,
"Bradenton"
,
"Bradenville"
,
"Bradleyville"
,
"Bradner"
,
"Bradyville"
,
"Braggadocio"
,
"Braggs"
,
"Braham"
,
"Braidwood"
,
"Brainerd"
,
"Braintree"
,
"Braithwaite"
,
"Braman"
,
"Bramwell"
,
"Branchdale"
,
"Branchland"
,
"Branchport"
,
"Branchton"
,
"Branchville"
,
"Brandamore"
,
"Brandonville"
,
"Brandsville"
,
"Branford"
,
"Branson"
,
"Brantingham"
,
"Brantley"
,
"Brantwood"
,
"Braselton"
,
"Brashear"
,
"Brasstown"
,
"Brattleboro"
,
"Brawley"
,
"Braxton"
,
"Braymer"
,
"Brayton"
,
"Brazeau"
,
"Brazoria"
,
"Brea"
,
"Breaks"
,
"Breda"
,
"Breeden"
,
"Breeding"
,
"Breedsville"
,
"Breese"
,
"Breesport"
,
"Breezewood"
,
"Breinigsville"
,
"Bremerton"
,
"Bremond"
,
"Brenham"
,
"Brentford"
,
"Brenton"
,
"Brentwood"
,
"Bretz"
,
"Brevard"
,
"Brewer"
,
"Brewerton"
,
"Brewton"
,
"Brianhead"
,
"Bricelyn"
,
"Briceville"
,
"Brickeys"
,
"Bridgehampton"
,
"Bridgeland"
,
"Bridger"
,
"Bridgeton"
,
"Bridgeville"
,
"Bridgman"
,
"Bridgton"
,
"Bridport"
,
"Brielle"
,
"Brierfield"
,
"Briggsdale"
,
"Briggsville"
,
"Brightwood"
,
"Brill"
,
"Brillion"
,
"Brimfield"
,
"Brimhall"
,
"Brimley"
,
"Brimson"
,
"Bringhurst"
,
"Brinkley"
,
"Brinklow"
,
"Brinktown"
,
"Brinnon"
,
"Brinsmade"
,
"Brinson"
,
"Brisbin"
,
"Briscoe"
,
"Bristolville"
,
"Bristow"
,
"Britt"
,
"Britton"
,
"Brixey"
,
"Broadalbin"
,
"Broadbent"
,
"Broadbrook"
,
"Broaddus"
,
"Broadford"
,
"Broadlands"
,
"Broadrun"
,
"Broadus"
,
"Broadview"
,
"Broadwater"
,
"Broadwell"
,
"Brocket"
,
"Brockport"
,
"Brockton"
,
"Brockway"
,
"Brockwell"
,
"Brocton"
,
"Broderick"
,
"Brodhead"
,
"Brodnax"
,
"Brogan"
,
"Brogue"
,
"Brohard"
,
"Brohman"
,
"Brokaw"
,
"Brokenbow"
,
"Bronaugh"
,
"Bronson"
,
"Bronston"
,
"Bronte"
,
"Bronwood"
,
"Brookdale"
,
"Brookeland"
,
"Brooker"
,
"Brookesmith"
,
"Brookeville"
,
"Brookfield"
,
"Brookings"
,
"Brookland"
,
"Brooklet"
,
"Brooklin"
,
"Brookneal"
,
"Brookport"
,
"Brooks"
,
"Brookshire"
,
"Brookston"
,
"Brooksville"
,
"Brookton"
,
"Brooktondale"
,
"Brookview"
,
"Brookville"
,
"Brookwood"
,
"Broomall"
,
"Broomfield"
,
"Brooten"
,
"Broseley"
,
"Brothers"
,
"Broughton"
,
"Broussard"
,
"Browder"
,
"Browerville"
,
"Brownfield"
,
"Browning"
,
"Brownlee"
,
"Browns"
,
"Brownsboro"
,
"Brownsburg"
,
"Brownsdale"
,
"Brownstown"
,
"Brownsville"
,
"Brownton"
,
"Browntown"
,
"Brownville"
,
"Brownwood"
,
"Broxton"
,
"Bruceton"
,
"Brucetown"
,
"Bruceville"
,
"Bruin"
,
"Bruington"
,
"Brule"
,
"Brumley"
,
"Brundidge"
,
"Bruneau"
,
"Bruner"
,
"Bruni"
,
"Bruning"
,
"Brunson"
,
"Brunsville"
,
"Brusett"
,
"Brushton"
,
"Brusly"
,
"Brutus"
,
"Bryantown"
,
"Bryantsville"
,
"Bryantville"
,
"Bryceland"
,
"Bryceville"
,
"Brynathyn"
,
"Brynmawr"
,
"Bryson"
,
"Buchtel"
,
"Buckatunna"
,
"Buckeystown"
,
"Buckfield"
,
"Buckhannon"
,
"Buckhead"
,
"Buckholts"
,
"Buckingham"
,
"Buckland"
,
"Bucklin"
,
"Buckman"
,
"Buckner"
,
"Bucks"
,
"Bucksport"
,
"Bucoda"
,
"Bucyrus"
,
"Buda"
,
"Bude"
,
"Bueche"
,
"Buellton"
,
"Bueyeros"
,
"Buford"
,
"Buhl"
,
"Buhler"
,
"Bula"
,
"Bulan"
,
"Bulger"
,
"Bullard"
,
"Bullshoals"
,
"Bullville"
,
"Bulpitt"
,
"Buna"
,
"Bunceton"
,
"Buncombe"
,
"Bunker"
,
"Bunkerville"
,
"Bunkie"
,
"Bunn"
,
"Bunnell"
,
"Bunola"
,
"Buras"
,
"Burchard"
,
"Burdett"
,
"Burdette"
,
"Burdick"
,
"Burdine"
,
"Burfordville"
,
"Burgaw"
,
"Burgettstown"
,
"Burgin"
,
"Burgoon"
,
"Burkburnett"
,
"Burkesville"
,
"Burket"
,
"Burkett"
,
"Burkettsville"
,
"Burkeville"
,
"Burkhart"
,
"Burkittsville"
,
"Burkville"
,
"Burleson"
,
"Burlingame"
,
"Burlingham"
,
"Burlison"
,
"Burna"
,
"Burnet"
,
"Burnettsville"
,
"Burney"
,
"Burneyville"
,
"Burnips"
,
"Burns"
,
"Burnsville"
,
"Burntcorn"
,
"Burnwell"
,
"Burrows"
,
"Burrton"
,
"Burson"
,
"Burtonsville"
,
"Burtrum"
,
"Burwell"
,
"Busby"
,
"Bushkill"
,
"Bushland"
,
"Bushton"
,
"Bushwood"
,
"Buskirk"
,
"Bussey"
,
"Butlerville"
,
"Butner"
,
"Butters"
,
"Buttonwillow"
,
"Buttzville"
,
"Byars"
,
"Bybee"
,
"Byesville"
,
"Byfield"
,
"Byhalia"
,
"Bylas"
,
"Bynum"
,
"Bypro"
,
"Byrdstown"
,
"Byrnedale"
,
"Byromville"
,
"Caballo"
,
"Cabazon"
,
"Cabery"
,
"Cabins"
,
"Cabool"
,
"Caborojo"
,
"Caddo"
,
"Cade"
,
"Cades"
,
"Cadiz"
,
"Cadmus"
,
"Cadogan"
,
"Cadott"
,
"Cadwell"
,
"Cadyville"
,
"Caguas"
,
"Cahokia"
,
"Cahone"
,
"Cainsville"
,
"Cairnbrook"
,
"Calabasas"
,
"Cale"
,
"Caledonia"
,
"Calera"
,
"Calexico"
,
"Calhan"
,
"Caliente"
,
"Califon"
,
"Calio"
,
"Calion"
,
"Calipatria"
,
"Calistoga"
,
"Callands"
,
"Callao"
,
"Callaway"
,
"Callender"
,
"Callensburg"
,
"Callery"
,
"Callicoon"
,
"Calliham"
,
"Calmar"
,
"Calverton"
,
"Camak"
,
"Camanche"
,
"Camargo"
,
"Camarillo"
,
"Camas"
,
"Cambra"
,
"Cambria"
,
"Cambridgeport"
,
"Camby"
,
"Camden"
,
"Camdenton"
,
"Camillus"
,
"Cammal"
,
"Campbellsburg"
,
"Campbellton"
,
"Campbelltown"
,
"Campo"
,
"Campobello"
,
"Campti"
,
"Campton"
,
"Camptonville"
,
"Camptown"
,
"Campwood"
,
"Camuy"
,
"Cana"
,
"Canadensis"
,
"Canadys"
,
"Canajoharie"
,
"Canalou"
,
"Canandaigua"
,
"Canaseraga"
,
"Canastota"
,
"Canby"
,
"Candia"
,
"Candler"
,
"Cando"
,
"Candor"
,
"Caneadea"
,
"Canebrake"
,
"Caney"
,
"Caneyville"
,
"Canisteo"
,
"Canistota"
,
"Canjilon"
,
"Canmer"
,
"Cannelburg"
,
"Cannelton"
,
"Cannonsburg"
,
"Cannonville"
,
"Canones"
,
"Canonsburg"
,
"Canova"
,
"Canovanas"
,
"Cantil"
,
"Cantonment"
,
"Cantrall"
,
"Cantril"
,
"Canute"
,
"Canutillo"
,
"Canyonville"
,
"Capac"
,
"Capefair"
,
"Capels"
,
"Capemay"
,
"Capeneddick"
,
"Capeville"
,
"Capitan"
,
"Capitola"
,
"Capron"
,
"Capshaw"
,
"Captaincook"
,
"Captiva"
,
"Capulin"
,
"Caputa"
,
"Caratunk"
,
"Carbonado"
,
"Carboncliff"
,
"Cardale"
,
"Cardin"
,
"Cardington"
,
"Cardville"
,
"Cardwell"
,
"Carencro"
,
"Caretta"
,
"Careywood"
,
"Carland"
,
"Carlile"
,
"Carlinville"
,
"Carlock"
,
"Carlos"
,
"Carlotta"
,
"Carlsbad"
,
"Carlsborg"
,
"Carman"
,
"Carmel"
,
"Carmi"
,
"Carmichaels"
,
"Carnarvon"
,
"Carnesville"
,
"Caro"
,
"Caroleen"
,
"Carona"
,
"Carpinteria"
,
"Carpio"
,
"Carrabelle"
,
"Carrboro"
,
"Carrier"
,
"Carriere"
,
"Carrington"
,
"Carrizozo"
,
"Carrolls"
,
"Carrollton"
,
"Carrolltown"
,
"Carrothers"
,
"Carrsville"
,
"Carsonville"
,
"Carter"
,
"Carteret"
,
"Cartersburg"
,
"Cartersville"
,
"Carterville"
,
"Cartwright"
,
"Caruthers"
,
"Carver"
,
"Carversville"
,
"Carville"
,
"Cary"
,
"Caryville"
,
"Casa"
,
"Casar"
,
"Cascadia"
,
"Cascilla"
,
"Casco"
,
"Caseville"
,
"Caseyville"
,
"Cashiers"
,
"Cashion"
,
"Cashton"
,
"Cashtown"
,
"Casmalia"
,
"Casnovia"
,
"Cason"
,
"Casper"
,
"Cass"
,
"Cassadaga"
,
"Cassatt"
,
"Casscoe"
,
"Cassel"
,
"Casselberry"
,
"Casselton"
,
"Cassoday"
,
"Cassopolis"
,
"Casstown"
,
"Cassville"
,
"Castalia"
,
"Castana"
,
"Castanea"
,
"Castell"
,
"Castella"
,
"Castile"
,
"Castine"
,
"Castleberry"
,
"Castledale"
,
"Castleford"
,
"Castleton"
,
"Castlewood"
,
"Castorland"
,
"Castroville"
,
"Cataldo"
,
"Catano"
,
"Catarina"
,
"Catasauqua"
,
"Cataula"
,
"Cataumet"
,
"Catawissa"
,
"Catharine"
,
"Catharpin"
,
"Cathay"
,
"Cathlamet"
,
"Catlett"
,
"Catlettsburg"
,
"Catlin"
,
"Cato"
,
"Catoosa"
,
"Catron"
,
"Cattaraugus"
,
"Caulfield"
,
"Causey"
,
"Cauthornville"
,
"Cavetown"
,
"Cavour"
,
"Cawood"
,
"Cayey"
,
"Cayucos"
,
"Cayuse"
,
"Cayuta"
,
"Cazadero"
,
"Cazenovia"
,
"Cebolla"
,
"Cecilton"
,
"Cedarbrook"
,
"Cedarburg"
,
"Cedarcrest"
,
"Cedaredge"
,
"Cedarhurst"
,
"Cedarkey"
,
"Cedarlane"
,
"Cedars"
,
"Cedartown"
,
"Cedarvale"
,
"Cedarville"
,
"Ceevee"
,
"Ceiba"
,
"Celestine"
,
"Celina"
,
"Celoron"
,
"Cementon"
,
"Centrahoma"
,
"Centralia"
,
"Centre"
,
"Centrehall"
,
"Centreville"
,
"Centuria"
,
"Ceredo"
,
"Ceresco"
,
"Cerrillos"
,
"Cerritos"
,
"Cerro"
,
"Cerrogordo"
,
"Chacon"
,
"Chadbourn"
,
"Chaddsford"
,
"Chadron"
,
"Chadwicks"
,
"Chaffee"
,
"Chalfont"
,
"Challis"
,
"Chalmette"
,
"Chama"
,
"Chamberino"
,
"Chambersburg"
,
"Chambersville"
,
"Chamisal"
,
"Champlin"
,
"Chana"
,
"Chandlerville"
,
"Changewater"
,
"Chanhassen"
,
"Channahon"
,
"Channing"
,
"Chanute"
,
"Chapin"
,
"Chapmansboro"
,
"Chapmanville"
,
"Chappaqua"
,
"Chappell"
,
"Chappells"
,
"Chaptico"
,
"Chardon"
,
"Charenton"
,
"Chariton"
,
"Charlemont"
,
"Charleroi"
,
"Charlestown"
,
"Charlevoix"
,
"Charlo"
,
"Charlton"
,
"Charmco"
,
"Chartley"
,
"Chaseburg"
,
"Chaseley"
,
"Chaska"
,
"Chassell"
,
"Chataignier"
,
"Chatawa"
,
"Chateaugay"
,
"Chatfield"
,
"Chatom"
,
"Chatsworth"
,
"Chattahoochee"
,
"Chattaroy"
,
"Chaumont"
,
"Chauvin"
,
"Chavies"
,
"Chazy"
,
"Cheapside"
,
"Chebanse"
,
"Cheboygan"
,
"Checotah"
,
"Chefornak"
,
"Chehalis"
,
"Chelan"
,
"Chelmsford"
,
"Chelsea"
,
"Cheltenham"
,
"Chemult"
,
"Chemung"
,
"Cheneyville"
,
"Chenoa"
,
"Chepachet"
,
"Cheraw"
,
"Cheriton"
,
"Cherryfield"
,
"Cherrylog"
,
"Cherrytree"
,
"Cherryville"
,
"Chesaning"
,
"Chesnee"
,
"Chesterfield"
,
"Chesterland"
,
"Chestertown"
,
"Chesterville"
,
"Cheswick"
,
"Cheswold"
,
"Chetek"
,
"Chetopa"
,
"Chevak"
,
"Chewalla"
,
"Chewelah"
,
"Chewsville"
,
"Cheyney"
,
"Chichester"
,
"Chickamauga"
,
"Chickasha"
,
"Chico"
,
"Chicopee"
,
"Chicora"
,
"Chicota"
,
"Chidester"
,
"Chiefland"
,
"Chignik"
,
"Chilcoot"
,
"Childersburg"
,
"Childress"
,
"Childs"
,
"Childwold"
,
"Chilhowee"
,
"Chilhowie"
,
"Chillicothe"
,
"Chilmark"
,
"Chilo"
,
"Chiloquin"
,
"Chilton"
,
"Chimacum"
,
"Chimayo"
,
"Chincoteague"
,
"Chinle"
,
"Chino"
,
"Chipley"
,
"Chireno"
,
"Chitina"
,
"Chittenango"
,
"Chittenden"
,
"Chivington"
,
"Chloe"
,
"Choccolocco"
,
"Chocorua"
,
"Chocowinity"
,
"Chokio"
,
"Chokoloskee"
,
"Cholame"
,
"Choteau"
,
"Choudrant"
,
"Chouteau"
,
"Chowchilla"
,
"Chriesman"
,
"Chrisman"
,
"Chrisney"
,
"Christiansted"
,
"Christoval"
,
"Chromo"
,
"Chualar"
,
"Chuckey"
,
"Chugiak"
,
"Chugwater"
,
"Chula"
,
"Chunchula"
,
"Churchton"
,
"Churchville"
,
"Churdan"
,
"Churubusco"
,
"Ciales"
,
"Cibolo"
,
"Cidra"
,
"Cima"
,
"Cimarron"
,
"Cincinnatus"
,
"Cinda"
,
"Cinebar"
,
"Circleville"
,
"Cisco"
,
"Cisne"
,
"Citra"
,
"Citronelle"
,
"Clackamas"
,
"Claflin"
,
"Clairfield"
,
"Clairton"
,
"Clancy"
,
"Clanton"
,
"Clarcona"
,
"Claremore"
,
"Clarinda"
,
"Clarington"
,
"Clarion"
,
"Clarissa"
,
"Clarita"
,
"Clarkdale"
,
"Clarkedale"
,
"Clarkesville"
,
"Clarkfield"
,
"Clarkia"
,
"Clarks"
,
"Clarksboro"
,
"Clarksburg"
,
"Clarksdale"
,
"Clarkson"
,
"Clarkston"
,
"Clarksville"
,
"Clarkton"
,
"Claryville"
,
"Clatonia"
,
"Clatskanie"
,
"Claudville"
,
"Claunch"
,
"Claverack"
,
"Clawson"
,
"Claxton"
,
"Clayhole"
,
"Claymont"
,
"Claypool"
,
"Claysburg"
,
"Claysville"
,
"Claytonville"
,
"Clayville"
,
"Clearbrook"
,
"Clearfield"
,
"Clearmont"
,
"Clearview"
,
"Clearville"
,
"Cleaton"
,
"Cleburne"
,
"Cleelum"
,
"Cleghorn"
,
"Clementon"
,
"Clements"
,
"Clemmons"
,
"Clemons"
,
"Clendenin"
,
"Clermont"
,
"Cleverdale"
,
"Cleves"
,
"Clewiston"
,
"Cliffwood"
,
"Clifty"
,
"Clinchco"
,
"Clinchfield"
,
"Clintondale"
,
"Clintonville"
,
"Clintwood"
,
"Clitherall"
,
"Clockville"
,
"Clontarf"
,
"Clopton"
,
"Cloquet"
,
"Closplint"
,
"Closter"
,
"Cloudcroft"
,
"Cloutierville"
,
"Clover"
,
"Cloverdale"
,
"Cloverport"
,
"Clovis"
,
"Clubb"
,
"Clune"
,
"Clute"
,
"Clutier"
,
"Clyman"
,
"Clymer"
,
"Clyo"
,
"Coachella"
,
"Coahoma"
,
"Coaldale"
,
"Coalfield"
,
"Coalgood"
,
"Coaling"
,
"Coalinga"
,
"Coalmont"
,
"Coalport"
,
"Coalton"
,
"Coalville"
,
"Coalwood"
,
"Coamo"
,
"Coarsegold"
,
"Coatesville"
,
"Coats"
,
"Coatsburg"
,
"Coatsville"
,
"Cobbtown"
,
"Cobden"
,
"Cobleskill"
,
"Coburn"
,
"Cochecton"
,
"Cochise"
,
"Cochranton"
,
"Cochranville"
,
"Cockeysville"
,
"Cocolalla"
,
"Cocolamus"
,
"Codell"
,
"Coden"
,
"Codorus"
,
"Coeburn"
,
"Coello"
,
"Coeymans"
,
"Coffeen"
,
"Coffeeville"
,
"Coffeyville"
,
"Cofield"
,
"Coggon"
,
"Cogswell"
,
"Cohagen"
,
"Cohasset"
,
"Cohoctah"
,
"Cohocton"
,
"Cohoes"
,
"Cohutta"
,
"Coila"
,
"Coinjock"
,
"Cokato"
,
"Cokeburg"
,
"Cokedale"
,
"Coker"
,
"Cokeville"
,
"Colbert"
,
"Colburn"
,
"Colchester"
,
"Colcord"
,
"Coldbrook"
,
"Colden"
,
"Coldwater"
,
"Colebrook"
,
"Colerain"
,
"Coleraine"
,
"Colesburg"
,
"Coleta"
,
"Coleville"
,
"Colfax"
,
"Collbran"
,
"Collettsville"
,
"Colleyville"
,
"Colliers"
,
"Colliersville"
,
"Collierville"
,
"Collingswood"
,
"Collinston"
,
"Collinsville"
,
"Collinwood"
,
"Collison"
,
"Collyer"
,
"Colman"
,
"Colmar"
,
"Colmesneil"
,
"Colo"
,
"Coloma"
,
"Colome"
,
"Colona"
,
"Colora"
,
"Colp"
,
"Colquitt"
,
"Colrain"
,
"Colstrip"
,
"Colton"
,
"Columbiana"
,
"Columbiaville"
,
"Colusa"
,
"Colver"
,
"Colville"
,
"Colwich"
,
"Combes"
,
"Combs"
,
"Comer"
,
"Comerio"
,
"Comfrey"
,
"Comins"
,
"Commack"
,
"Commiskey"
,
"Como"
,
"Comptche"
,
"Comstock"
,
"Conasauga"
,
"Conaway"
,
"Concan"
,
"Concepcion"
,
"Concho"
,
"Conconully"
,
"Concordia"
,
"Concordville"
,
"Conda"
,
"Conde"
,
"Condon"
,
"Conehatta"
,
"Conejos"
,
"Conestee"
,
"Conesus"
,
"Conesville"
,
"Conetoe"
,
"Confluence"
,
"Conger"
,
"Congers"
,
"Congerville"
,
"Conneaut"
,
"Conneautville"
,
"Connell"
,
"Connellsville"
,
"Connelly"
,
"Connersville"
,
"Connerville"
,
"Conover"
,
"Conowingo"
,
"Conran"
,
"Conrath"
,
"Conroe"
,
"Conroy"
,
"Conshohocken"
,
"Constable"
,
"Constantia"
,
"Contoocook"
,
"Conyers"
,
"Conyngham"
,
"Cookeville"
,
"Cooks"
,
"Cooksburg"
,
"Cookson"
,
"Cookstown"
,
"Cooksville"
,
"Cookville"
,
"Cooleemee"
,
"Coolin"
,
"Coolville"
,
"Cooper"
,
"Coopersburg"
,
"Cooperstown"
,
"Coopersville"
,
"Coosa"
,
"Coosada"
,
"Cooter"
,
"Copake"
,
"Copan"
,
"Copemish"
,
"Copeville"
,
"Copiague"
,
"Coplay"
,
"Coppell"
,
"Copperopolis"
,
"Coquille"
,
"Cora"
,
"Coralville"
,
"Coram"
,
"Coraopolis"
,
"Corapeake"
,
"Corbettsville"
,
"Corbin"
,
"Cordele"
,
"Cordell"
,
"Corder"
,
"Cordesville"
,
"Cordova"
,
"Corea"
,
"Corfu"
,
"Corinna"
,
"Corinne"
,
"Corley"
,
"Cornersville"
,
"Cornettsville"
,
"Corning"
,
"Cornland"
,
"Cornlea"
,
"Cornville"
,
"Cornwallville"
,
"Corolla"
,
"Corozal"
,
"Corrales"
,
"Correll"
,
"Corrigan"
,
"Corriganville"
,
"Corry"
,
"Corryton"
,
"Corsica"
,
"Corsicana"
,
"Corson"
,
"Cortaro"
,
"Cortemadera"
,
"Cortez"
,
"Corton"
,
"Corunna"
,
"Corwith"
,
"Cory"
,
"Corydon"
,
"Cosby"
,
"Coscob"
,
"Coshocton"
,
"Cosmopolis"
,
"Cossayuna"
,
"Costigan"
,
"Costilla"
,
"Cotati"
,
"Coteau"
,
"Cotesfield"
,
"Cotolaurel"
,
"Cotopaxi"
,
"Cottageville"
,
"Cottekill"
,
"Cotter"
,
"Cottle"
,
"Cottleville"
,
"Cottondale"
,
"Cottonport"
,
"Cottonton"
,
"Cottontown"
,
"Cotuit"
,
"Cotulla"
,
"Couderay"
,
"Coudersport"
,
"Coulters"
,
"Coulterville"
,
"Counce"
,
"Coupeville"
,
"Coupland"
,
"Courtenay"
,
"Courtland"
,
"Courtois"
,
"Coushatta"
,
"Covel"
,
"Covelo"
,
"Covena"
,
"Covesville"
,
"Covina"
,
"Covington"
,
"Cowanesque"
,
"Cowansville"
,
"Cowarts"
,
"Cowden"
,
"Cowdrey"
,
"Cowen"
,
"Coweta"
,
"Cowgill"
,
"Cowiche"
,
"Cowlesville"
,
"Cowley"
,
"Coxsackie"
,
"Coyanosa"
,
"Coyle"
,
"Coyville"
,
"Cozad"
,
"Craborchard"
,
"Crabtree"
,
"Craddockville"
,
"Craftsbury"
,
"Cragford"
,
"Cragsmoor"
,
"Craigmont"
,
"Craigsville"
,
"Craigville"
,
"Craley"
,
"Cramerton"
,
"Cranbury"
,
"Crandon"
,
"Cranesville"
,
"Cranks"
,
"Crapo"
,
"Crary"
,
"Craryville"
,
"Crawfordville"
,
"Crawley"
,
"Crayne"
,
"Craynor"
,
"Creede"
,
"Creedmoor"
,
"Creighton"
,
"Crenshaw"
,
"Creola"
,
"Cresbard"
,
"Cresco"
,
"Cressey"
,
"Cresskill"
,
"Cresson"
,
"Cressona"
,
"Crestline"
,
"Creston"
,
"Crestone"
,
"Crestwood"
,
"Creswell"
,
"Crewe"
,
"Crichton"
,
"Criders"
,
"Crimora"
,
"Crisfield"
,
"Crittenden"
,
"Critz"
,
"Crivitz"
,
"Crocheron"
,
"Crocker"
,
"Crocketville"
,
"Crofton"
,
"Croghan"
,
"Cromona"
,
"Crooks"
,
"Crookston"
,
"Crooksville"
,
"Cropsey"
,
"Cropseyville"
,
"Cropwell"
,
"Crosbyton"
,
"Crossett"
,
"Crossnore"
,
"Crossroads"
,
"Crossville"
,
"Crosswicks"
,
"Croswell"
,
"Crothersville"
,
"Croton"
,
"Crouse"
,
"Crouseville"
,
"Crowder"
,
"Crowell"
,
"Crowheart"
,
"Crownsville"
,
"Crowville"
,
"Crozet"
,
"Crozier"
,
"Cruger"
,
"Crum"
,
"Crumpler"
,
"Crumpton"
,
"Crumrod"
,
"Cubage"
,
"Cubero"
,
"Cubrun"
,
"Cuchillo"
,
"Cudahy"
,
"Cuddy"
,
"Cuero"
,
"Cuervo"
,
"Culberson"
,
"Culdesac"
,
"Culebra"
,
"Cullen"
,
"Culleoka"
,
"Cullman"
,
"Culloden"
,
"Cullom"
,
"Cullowhee"
,
"Culpeper"
,
"Cumbola"
,
"Cumby"
,
"Cummaquid"
,
"Cumming"
,
"Cummington"
,
"Cundiff"
,
"Cuney"
,
"Cupertino"
,
"Curdsville"
,
"Curllsville"
,
"Currie"
,
"Currituck"
,
"Curryville"
,
"Curtice"
,
"Curtin"
,
"Curtiss"
,
"Curtisville"
,
"Curwensville"
,
"Cusick"
,
"Cusseta"
,
"Custar"
,
"Cutbank"
,
"Cutchogue"
,
"Cuthbert"
,
"Cutshin"
,
"Cuttingsville"
,
"Cuttyhunk"
,
"Cutuno"
,
"Cuyama"
,
"Cuyler"
,
"Cuzzart"
,
"Cygnet"
,
"Cynthiana"
,
"Cynwyd"
,
"Cypressinn"
,
"Dabneys"
,
"Dabolt"
,
"Dacoma"
,
"Dacono"
,
"Dacula"
,
"Dadeville"
,
"Dafter"
,
"Daggett"
,
"Dagmar"
,
"Dagsboro"
,
"Dagusmines"
,
"Dahinda"
,
"Dahlgren"
,
"Dahlonega"
,
"Daingerfield"
,
"Daisetta"
,
"Daisy"
,
"Daisytown"
,
"Dalbo"
,
"Daleville"
,
"Dalhart"
,
"Dallardsville"
,
"Dalmatia"
,
"Damar"
,
"Damariscotta"
,
"Dameron"
,
"Danboro"
,
"Danby"
,
"Danciger"
,
"Danese"
,
"Danevang"
,
"Danforth"
,
"Dania"
,
"Daniels"
,
"Danielsville"
,
"Dannebrog"
,
"Dannemora"
,
"Dansville"
,
"Danvers"
,
"Danville"
,
"Darby"
,
"Dardanelle"
,
"Darden"
,
"Darfur"
,
"Darien"
,
"Darlington"
,
"Darragh"
,
"Darrington"
,
"Darrouzett"
,
"Darrow"
,
"Dassel"
,
"Datil"
,
"Datto"
,
"Davant"
,
"Davey"
,
"Davidsonville"
,
"Davidsville"
,
"Davilla"
,
"Davin"
,
"Davisboro"
,
"Davisburg"
,
"Daviston"
,
"Davisville"
,
"Dawes"
,
"Dawmont"
,
"Dawsonville"
,
"Dayhoit"
,
"Daykin"
,
"Dayville"
,
"Dazey"
,
"DeKalb"
,
"Deale"
,
"Deansboro"
,
"Deanville"
,
"Dearing"
,
"Dearmanville"
,
"Deary"
,
"Deatsville"
,
"Deaver"
,
"Debary"
,
"Debeque"
,
"Deberry"
,
"Debord"
,
"Decaturville"
,
"Decherd"
,
"Deckerville"
,
"Declo"
,
"Decorah"
,
"Dedham"
,
"Deedsville"
,
"Deepwater"
,
"Deerbrook"
,
"Deerfield"
,
"Deering"
,
"Deersville"
,
"Deerton"
,
"Deerwood"
,
"Deeth"
,
"Deferiet"
,
"Defiance"
,
"Defoe"
,
"Deford"
,
"Degraff"
,
"Dehue"
,
"Delafield"
,
"Delancey"
,
"Deland"
,
"Delanson"
,
"Delaplaine"
,
"Delaplane"
,
"Delavan"
,
"Delbarton"
,
"Delcambre"
,
"Delco"
,
"Deleon"
,
"Delevan"
,
"Dellroy"
,
"Dellslow"
,
"Delmar"
,
"Delmita"
,
"Delmont"
,
"Delnorte"
,
"Deloit"
,
"Delong"
,
"Delphia"
,
"Delphos"
,
"Delray"
,
"Delrey"
,
"Delrio"
,
"Deltaville"
,
"Delton"
,
"Delvalle"
,
"Dema"
,
"Demarest"
,
"Deming"
,
"Demopolis"
,
"Demorest"
,
"Demossville"
,
"Demotte"
,
"Dempster"
,
"Denair"
,
"Denbigh"
,
"Denbo"
,
"Dendron"
,
"Denham"
,
"Denhoff"
,
"Denio"
,
"Denison"
,
"Dennard"
,
"Dennison"
,
"Dennisport"
,
"Denniston"
,
"Dennisville"
,
"Dennysville"
,
"Densmore"
,
"Denville"
,
"Depauville"
,
"Depauw"
,
"Depere"
,
"Depew"
,
"Depeyster"
,
"Depoy"
,
"Depue"
,
"Dequeen"
,
"Derbyline"
,
"Derma"
,
"Dermott"
,
"Derry"
,
"Deruyter"
,
"Derwent"
,
"Desarc"
,
"Descanso"
,
"Desdemona"
,
"Desha"
,
"Deshler"
,
"Deslacs"
,
"Desmet"
,
"Desmoines"
,
"Desoto"
,
"Destin"
,
"Destrehan"
,
"Devault"
,
"Devers"
,
"Deville"
,
"Devine"
,
"Devol"
,
"Dewart"
,
"Deweese"
,
"Deweyville"
,
"Dewittville"
,
"Dewyrose"
,
"Deyoung"
,
"Dhanis"
,
"Diablo"
,
"Diamondville"
,
"Diaz"
,
"Diboll"
,
"Dickeyville"
,
"Dierks"
,
"Dieterich"
,
"Diggins"
,
"Diggs"
,
"Dighton"
,
"Digiorgio"
,
"Dike"
,
"Dillard"
,
"Dille"
,
"Diller"
,
"Dilley"
,
"Dilliner"
,
"Dillingham"
,
"Dillonvale"
,
"Dillsboro"
,
"Dillsburg"
,
"Dilltown"
,
"Dillwyn"
,
"Dilworth"
,
"Dimebox"
,
"Dimmitt"
,
"Dimock"
,
"Dimondale"
,
"Dingess"
,
"Dingle"
,
"Dingus"
,
"Dinuba"
,
"Dinwiddie"
,
"Disputanta"
,
"Dittmer"
,
"Divernon"
,
"Dix"
,
"Dixfield"
,
"Dixiana"
,
"Dixmont"
,
"Dixonville"
,
"Dizney"
,
"Dlo"
,
"Dobbins"
,
"Docena"
,
"Doddsville"
,
"Dodgeville"
,
"Doerun"
,
"Dogpatch"
,
"Dogue"
,
"Dola"
,
"Doland"
,
"Dolgeville"
,
"Dolliver"
,
"Dolph"
,
"Dolton"
,
"Donaana"
,
"Donalds"
,
"Donalsonville"
,
"Donegal"
,
"Dongola"
,
"Donie"
,
"Doniphan"
,
"Donnellson"
,
"Donnelsville"
,
"Donora"
,
"Doole"
,
"Doon"
,
"Doran"
,
"Dorena"
,
"Dorloo"
,
"Dornsife"
,
"Dorr"
,
"Dorrance"
,
"Dorris"
,
"Dorsey"
,
"Dorton"
,
"Dospalos"
,
"Doss"
,
"Doswell"
,
"Dothan"
,
"Doty"
,
"Doucette"
,
"Douds"
,
"Douglassville"
,
"Douglasville"
,
"Dousman"
,
"Dover"
,
"Dovray"
,
"Dowagiac"
,
"Dowell"
,
"Dowelltown"
,
"Downieville"
,
"Downingtown"
,
"Downsville"
,
"Dows"
,
"Doylestown"
,
"Doyline"
,
"Doyon"
,
"Dozier"
,
"Dracut"
,
"Draffin"
,
"Drakesboro"
,
"Drakesville"
,
"Draper"
,
"Drasco"
,
"Dravosburg"
,
"Drayden"
,
"Drayton"
,
"Drennen"
,
"Dresden"
,
"Dresser"
,
"Drewryville"
,
"Drewsey"
,
"Dreyfus"
,
"Drifting"
,
"Drifton"
,
"Driftwood"
,
"Driggs"
,
"Drummonds"
,
"Drumore"
,
"Drumright"
,
"Drums"
,
"Dryprong"
,
"Duanesburg"
,
"Duarte"
,
"Dubach"
,
"Dubberly"
,
"Dubois"
,
"Dubre"
,
"Dubuque"
,
"Duchesne"
,
"Ducktown"
,
"Duckwater"
,
"Ducor"
,
"Duenweg"
,
"Duewest"
,
"Duffau"
,
"Duffield"
,
"Dufur"
,
"Dugger"
,
"Dugspur"
,
"Dugway"
,
"Dulac"
,
"Dulce"
,
"Dulzura"
,
"Dumas"
,
"Dumfries"
,
"Dumont"
,
"Duncannon"
,
"Duncansville"
,
"Duncanville"
,
"Duncombe"
,
"Dundas"
,
"Dundee"
,
"Dunellen"
,
"Dunfermline"
,
"Dungannon"
,
"Dunkerton"
,
"Dunlevy"
,
"Dunlo"
,
"Dunlow"
,
"Dunmor"
,
"Dunmore"
,
"Dunnegan"
,
"Dunnell"
,
"Dunnellon"
,
"Dunnigan"
,
"Dunning"
,
"Dunnsville"
,
"Dunnville"
,
"Dunreith"
,
"Dunseith"
,
"Dunsmuir"
,
"Dunstable"
,
"Dunwoody"
,
"Duplessis"
,
"Dupo"
,
"Dupree"
,
"Dupuyer"
,
"Duquoin"
,
"Duran"
,
"Durand"
,
"Durant"
,
"Durbin"
,
"Durhamville"
,
"Dushore"
,
"Duson"
,
"Dustin"
,
"Dutchtown"
,
"Dutzow"
,
"Duvall"
,
"Duxbury"
,
"Dwale"
,
"Dycusburg"
,
"Dyersburg"
,
"Dyersville"
,
"Dyess"
,
"Dysart"
,
"Eads"
,
"Eagar"
,
"Eagarville"
,
"Eaglesmere"
,
"Eagletown"
,
"Eagleville"
,
"Eakly"
,
"Earle"
,
"Earleton"
,
"Earleville"
,
"Earlham"
,
"Earlimart"
,
"Earling"
,
"Earlington"
,
"Earlsboro"
,
"Earlton"
,
"Earlville"
,
"Early"
,
"Earlysville"
,
"Earp"
,
"Easley"
,
"Eatonton"
,
"Eatontown"
,
"Eatonville"
,
"Eauclaire"
,
"Eaugalle"
,
"Ebenezer"
,
"Ebensburg"
,
"Ebervale"
,
"Ebeye"
,
"Ebro"
,
"Echola"
,
"Echols"
,
"Eckelson"
,
"Eckerman"
,
"Eckert"
,
"Eckerty"
,
"Eckley"
,
"Eckman"
,
"Ecorse"
,
"Ecru"
,
"Ector"
,
"Edcouch"
,
"Eddyville"
,
"Edelstein"
,
"Edenton"
,
"Edenville"
,
"Edgard"
,
"Edgarton"
,
"Edgartown"
,
"Edgefield"
,
"Edgeley"
,
"Edgemont"
,
"Edgemoor"
,
"Edgewater"
,
"Edgewood"
,
"Edina"
,
"Edinboro"
,
"Edinburg"
,
"Edmeston"
,
"Edmon"
,
"Edmond"
,
"Edmonson"
,
"Edmore"
,
"Edneyville"
,
"Edon"
,
"Edroy"
,
"Edson"
,
"Edwall"
,
"Edwardsburg"
,
"Edwardsport"
,
"Edwardsville"
,
"Eek"
,
"Effingham"
,
"Efland"
,
"Egegik"
,
"Egeland"
,
"Eggleston"
,
"Eglon"
,
"Egnar"
,
"Ehrenberg"
,
"Ehrhardt"
,
"Eidson"
,
"Eitzen"
,
"Ekalaka"
,
"Ekron"
,
"Ekwok"
,
"Eland"
,
"Elbe"
,
"Elberfeld"
,
"Elberon"
,
"Elbert"
,
"Elberta"
,
"Elberton"
,
"Elbing"
,
"Elburn"
,
"Elcho"
,
"Elco"
,
"Eldena"
,
"Elderon"
,
"Eldersville"
,
"Elderton"
,
"Eldred"
,
"Eleele"
,
"Eleroy"
,
"Eleva"
,
"Elfers"
,
"Eliasville"
,
"Elida"
,
"Elizabethton"
,
"Elizabethtown"
,
"Elizaville"
,
"Elkader"
,
"Elkhorn"
,
"Elkin"
,
"Elkins"
,
"Elkland"
,
"Elkmont"
,
"Elkmound"
,
"Elko"
,
"Elkport"
,
"Elkton"
,
"Elkview"
,
"Elkville"
,
"Elkwood"
,
"Ellabell"
,
"Ellamore"
,
"Ellaville"
,
"Ellenboro"
,
"Ellenburg"
,
"Ellendale"
,
"Ellensburg"
,
"Ellenton"
,
"Ellenville"
,
"Ellenwood"
,
"Ellerbe"
,
"Ellerslie"
,
"Ellery"
,
"Ellettsville"
,
"Ellicottville"
,
"Ellijay"
,
"Ellinger"
,
"Ellington"
,
"Ellinwood"
,
"Elliottsburg"
,
"Elliottville"
,
"Ellisburg"
,
"Elliston"
,
"Ellisville"
,
"Elloree"
,
"Ellsinore"
,
"Ellston"
,
"Elma"
,
"Elmaton"
,
"Elmdale"
,
"Elmendorf"
,
"Elmhall"
,
"Elmmott"
,
"Elmo"
,
"Elmonte"
,
"Elmora"
,
"Elmore"
,
"Elmwood"
,
"Elnora"
,
"Elora"
,
"Eloy"
,
"Elrod"
,
"Elroy"
,
"Elsa"
,
"Elsah"
,
"Elsberry"
,
"Elsmere"
,
"Elsmore"
,
"Elvaston"
,
"Elverson"
,
"Elverta"
,
"Elwell"
,
"Elwin"
,
"Elwood"
,
"Elyria"
,
"Elysburg"
,
"Embudo"
,
"Emden"
,
"Emeigh"
,
"Emelle"
,
"Emerado"
,
"Emigsville"
,
"Eminence"
,
"Emington"
,
"Emison"
,
"Emlenton"
,
"Emlyn"
,
"Emmalena"
,
"Emmaus"
,
"Emmet"
,
"Emmetsburg"
,
"Emmitsburg"
,
"Emmonak"
,
"Emmons"
,
"Emporia"
,
"Encampment"
,
"Encinal"
,
"Encinitas"
,
"Encino"
,
"Endeavor"
,
"Enderlin"
,
"Enders"
,
"Engadine"
,
"Engelhard"
,
"Englishtown"
,
"Enka"
,
"Enloe"
,
"Ennice"
,
"Enning"
,
"Ennis"
,
"Enochs"
,
"Enola"
,
"Enon"
,
"Enoree"
,
"Ensenada"
,
"Ensign"
,
"Entiat"
,
"Entriken"
,
"Enumclaw"
,
"Enville"
,
"Eola"
,
"Eolia"
,
"Epes"
,
"Ephrata"
,
"Epping"
,
"Epps"
,
"Epworth"
,
"Equality"
,
"Equinunk"
,
"Erath"
,
"Erbacon"
,
"Erhard"
,
"Erick"
,
"Ericson"
,
"Erieville"
,
"Eriline"
,
"Erin"
,
"Ermine"
,
"Ernul"
,
"Erving"
,
"Erwinna"
,
"Erwinville"
,
"Esbon"
,
"Escalante"
,
"Escalon"
,
"Escanaba"
,
"Escatawpa"
,
"Escoheag"
,
"Escondido"
,
"Eskdale"
,
"Esko"
,
"Esmond"
,
"Esmont"
,
"Esopus"
,
"Espanola"
,
"Esparto"
,
"Esperance"
,
"Essexfells"
,
"Essexville"
,
"Essie"
,
"Essig"
,
"Essington"
,
"Estacada"
,
"Estancia"
,
"Estelline"
,
"Estero"
,
"Estherville"
,
"Estherwood"
,
"Estill"
,
"Ethelsville"
,
"Etiwanda"
,
"Etlan"
,
"Etna"
,
"Etoile"
,
"Eton"
,
"Etowah"
,
"Etta"
,
"Etters"
,
"Etterville"
,
"Ettrick"
,
"Etty"
,
"Eubank"
,
"Eucha"
,
"Eudora"
,
"Eufaula"
,
"Euless"
,
"Eupora"
,
"Eure"
,
"Eustace"
,
"Eustis"
,
"Eutaw"
,
"Eutawville"
,
"Evadale"
,
"Evan"
,
"Evansport"
,
"Evant"
,
"Evart"
,
"Evarts"
,
"Eveleth"
,
"Eveningshade"
,
"Evensville"
,
"Everest"
,
"Everetts"
,
"Everettville"
,
"Everly"
,
"Everson"
,
"Everton"
,
"Evington"
,
"Evinston"
,
"Ewan"
,
"Ewell"
,
"Ewen"
,
"Excello"
,
"Exeland"
,
"Exira"
,
"Exline"
,
"Exmore"
,
"Exton"
,
"Eyota"
,
"Ezel"
,
"Fabens"
,
"Fabius"
,
"Fabyan"
,
"Fackler"
,
"Factoryville"
,
"Fagus"
,
"Fairbank"
,
"Fairbanks"
,
"Fairborn"
,
"Fairburn"
,
"Fairbury"
,
"Fairchance"
,
"Fairchild"
,
"Fairdale"
,
"Fairhope"
,
"Fairland"
,
"Fairlawn"
,
"Fairlee"
,
"Fairmont"
,
"Fairoaks"
,
"Fairplay"
,
"Fairton"
,
"Fairview"
,
"Fairwater"
,
"Faison"
,
"Fajardo"
,
"Falconer"
,
"Falfurrias"
,
"Falkland"
,
"Falkner"
,
"Falkville"
,
"Fallbrook"
,
"Fallon"
,
"Falls"
,
"Fallsburg"
,
"Fallston"
,
"Falun"
,
"Fancher"
,
"Fannettsburg"
,
"Fannin"
,
"Fanshawe"
,
"Fanwood"
,
"Faribault"
,
"Farisita"
,
"Farler"
,
"Farlington"
,
"Farmdale"
,
"Farmer"
,
"Farmers"
,
"Farmersburg"
,
"Farmersville"
,
"Farmerville"
,
"Farmingdale"
,
"Farmingville"
,
"Farmville"
,
"Farnam"
,
"Farner"
,
"Farnham"
,
"Farnhamville"
,
"Farragut"
,
"Farrandsville"
,
"Farrar"
,
"Farson"
,
"Farwell"
,
"Fashing"
,
"Faubush"
,
"Faucett"
,
"Faulkton"
,
"Faunsdale"
,
"Fawnskin"
,
"Faxon"
,
"Faywood"
,
"Federalsburg"
,
"Feesburg"
,
"Felch"
,
"Felda"
,
"Fellows"
,
"Fellsmere"
,
"Felton"
,
"Fenelton"
,
"Fennimore"
,
"Fennville"
,
"Fentress"
,
"Fenwick"
,
"Ferndale"
,
"Ferney"
,
"Fernley"
,
"Fernwood"
,
"Ferrellsburg"
,
"Ferriday"
,
"Ferrisburg"
,
"Ferron"
,
"Ferrum"
,
"Ferrysburg"
,
"Ferryville"
,
"Fessenden"
,
"Festina"
,
"Festus"
,
"Feurabush"
,
"Fiatt"
,
"Fiddletown"
,
"Fieldale"
,
"Fielding"
,
"Fieldon"
,
"Fieldton"
,
"Fifield"
,
"Filer"
,
"Filion"
,
"Filley"
,
"Fillmore"
,
"Finchville"
,
"Findlay"
,
"Fineview"
,
"Fingal"
,
"Fingerville"
,
"Finksburg"
,
"Finlayson"
,
"Finleyville"
,
"Finly"
,
"Firebaugh"
,
"Firebrick"
,
"Firesteel"
,
"Firth"
,
"Fisher"
,
"Fishers"
,
"Fishersville"
,
"Fishertown"
,
"Fisherville"
,
"Fishkill"
,
"Fishtail"
,
"Fishtrap"
,
"Fiskdale"
,
"Fiskeville"
,
"Fisty"
,
"Fithian"
,
"Fittstown"
,
"Fitzhugh"
,
"Flagtown"
,
"Flandreau"
,
"Flasher"
,
"Flatlick"
,
"Flatonia"
,
"Flatwoods"
,
"Flaxton"
,
"Flaxville"
,
"Fleetville"
,
"Fleetwood"
,
"Fleischmanns"
,
"Flemingsburg"
,
"Flemington"
,
"Flensburg"
,
"Flicksville"
,
"Flinton"
,
"Flintstone"
,
"Flintville"
,
"Flippin"
,
"Flom"
,
"Flomaton"
,
"Flomot"
,
"Floodwood"
,
"Florala"
,
"Floresville"
,
"Florien"
,
"Floris"
,
"Florissant"
,
"Floriston"
,
"Flossmoor"
,
"Flourtown"
,
"Flovilla"
,
"Floydada"
,
"Floyddale"
,
"Fluker"
,
"Flushing"
,
"Fluvanna"
,
"Flyingh"
,
"Fogelsville"
,
"Fogertown"
,
"Fola"
,
"Folcroft"
,
"Folkston"
,
"Follansbee"
,
"Follett"
,
"Folsom"
,
"Folsomville"
,
"Fombell"
,
"Fonda"
,
"Fonddulac"
,
"Foneswood"
,
"Fontana"
,
"Fontanelle"
,
"Fontanet"
,
"Foosland"
,
"Footville"
,
"Foraker"
,
"Forbestown"
,
"Fordcliff"
,
"Fordland"
,
"Fordoche"
,
"Fords"
,
"Fordsville"
,
"Fordville"
,
"Fordyce"
,
"Foreman"
,
"Forestburg"
,
"Forestburgh"
,
"Forestdale"
,
"Foreston"
,
"Forestport"
,
"Forestville"
,
"Forgan"
,
"Foristell"
,
"Forkland"
,
"Forks"
,
"Forksville"
,
"Forkunion"
,
"Forkville"
,
"Forman"
,
"Formoso"
,
"Forney"
,
"Forreston"
,
"Forsan"
,
"Forsyth"
,
"Fosston"
,
"Fosters"
,
"Fosterville"
,
"Fostoria"
,
"Fouke"
,
"Fountaintown"
,
"Fountainville"
,
"Fourmile"
,
"Fouroaks"
,
"Fowler"
,
"Fowlerton"
,
"Fowlerville"
,
"Fowlkes"
,
"Fowlstown"
,
"Foxboro"
,
"Foxburg"
,
"Foxcroft"
,
"Foxholm"
,
"Foxton"
,
"Foxtown"
,
"Foxworth"
,
"Foyil"
,
"Frackville"
,
"Frakes"
,
"Frametown"
,
"Framingham"
,
"Francestown"
,
"Francesville"
,
"Francitas"
,
"Franconia"
,
"Frankclay"
,
"Frankenmuth"
,
"Frankewing"
,
"Frankford"
,
"Franklinton"
,
"Franklintown"
,
"Franklinville"
,
"Frankston"
,
"Franksville"
,
"Frankton"
,
"Franktown"
,
"Frankville"
,
"Frannie"
,
"Frazee"
,
"Frazer"
,
"Frazeysburg"
,
"Frederica"
,
"Fredericktown"
,
"Frederika"
,
"Frederiksted"
,
"Fredonia"
,
"Fredville"
,
"Freeborn"
,
"Freeburg"
,
"Freeburn"
,
"Freeland"
,
"Freelandville"
,
"Freemanspur"
,
"Freesoil"
,
"Freeunion"
,
"Freeville"
,
"Freewater"
,
"Freistatt"
,
"Fremont"
,
"Frenchboro"
,
"Frenchburg"
,
"Frenchlick"
,
"Frenchtown"
,
"Frenchville"
,
"Frewsburg"
,
"Friant"
,
"Friedens"
,
"Friedensburg"
,
"Friedheim"
,
"Friendly"
,
"Friendship"
,
"Friendsville"
,
"Friendswood"
,
"Frierson"
,
"Fries"
,
"Friesland"
,
"Friona"
,
"Frisco"
,
"Fritch"
,
"Frogmore"
,
"Frohna"
,
"Froid"
,
"Fromberg"
,
"Frontenac"
,
"Frontroyal"
,
"Frostburg"
,
"Fruita"
,
"Fruitdale"
,
"Fruithurst"
,
"Fruitland"
,
"Fruitport"
,
"Fruitvale"
,
"Fryburg"
,
"Fryeburg"
,
"Fuget"
,
"Fulda"
,
"Fulshear"
,
"Fultondale"
,
"Fultonham"
,
"Fultonville"
,
"Fults"
,
"Funkstown"
,
"Funston"
,
"Fuquay"
,
"Fyffe"
,
"Gaastra"
,
"Gabbs"
,
"Gabriels"
,
"Gackle"
,
"Gadsden"
,
"Gaffney"
,
"Gagetown"
,
"Gainesboro"
,
"Gainestown"
,
"Gaither"
,
"Gakona"
,
"Galata"
,
"Galax"
,
"Galesburg"
,
"Galesville"
,
"Galeton"
,
"Galien"
,
"Galion"
,
"Gallatin"
,
"Gallaway"
,
"Galliano"
,
"Gallina"
,
"Gallion"
,
"Gallipolis"
,
"Gallitzin"
,
"Gallman"
,
"Gallupville"
,
"Galva"
,
"Galvin"
,
"Gamaliel"
,
"Gambier"
,
"Gambrills"
,
"Ganado"
,
"Gandeeville"
,
"Gans"
,
"Gansevoort"
,
"Gantt"
,
"Gapland"
,
"Gapville"
,
"Garardsfort"
,
"Garber"
,
"Garberville"
,
"Garciasville"
,
"Gardena"
,
"Gardendale"
,
"Gardenville"
,
"Gardiner"
,
"Gardners"
,
"Gardnerville"
,
"Garita"
,
"Garnavillo"
,
"Garnerville"
,
"Garnett"
,
"Garrard"
,
"Garrattsville"
,
"Garretson"
,
"Garrettsville"
,
"Garrisonville"
,
"Garvin"
,
"Garwin"
,
"Garwood"
,
"Garysburg"
,
"Garyville"
,
"Gasburg"
,
"Gasconade"
,
"Gasport"
,
"Gasquet"
,
"Gassaway"
,
"Gassville"
,
"Gastonia"
,
"Gastonville"
,
"Gatesville"
,
"Gatewood"
,
"Gattman"
,
"Gatzke"
,
"Gause"
,
"Gautier"
,
"Gaylesville"
,
"Gaylordsville"
,
"Gays"
,
"Gaysville"
,
"Gayville"
,
"Geary"
,
"Geddes"
,
"Geff"
,
"Geigertown"
,
"Geismar"
,
"Geneautry"
,
"Genesee"
,
"Geneseo"
,
"Gentryville"
,
"Georgiana"
,
"Gepp"
,
"Gering"
,
"Gerlach"
,
"Gerlaw"
,
"Germansville"
,
"Germanton"
,
"Geronimo"
,
"Gerrardstown"
,
"Gerton"
,
"Gervais"
,
"Getzville"
,
"Geyserville"
,
"Gheen"
,
"Gheens"
,
"Gibbonsville"
,
"Gibbsboro"
,
"Gibbstown"
,
"Gibsland"
,
"Gibsonburg"
,
"Gibsonia"
,
"Gibsonton"
,
"Gibsonville"
,
"Giddings"
,
"Gilberton"
,
"Gilbertown"
,
"Gilberts"
,
"Gilbertsville"
,
"Gilbertville"
,
"Gilboa"
,
"Gilby"
,
"Gilcrest"
,
"Gildford"
,
"Gile"
,
"Gilford"
,
"Gillett"
,
"Gilley"
,
"Gillham"
,
"Gilliam"
,
"Gillmore"
,
"Gillsville"
,
"Gilman"
,
"Gilmanton"
,
"Gilmer"
,
"Gilroy"
,
"Gilson"
,
"Gilsum"
,
"Giltner"
,
"Gipsy"
,
"Girard"
,
"Girdler"
,
"Girdletree"
,
"Girdwood"
,
"Girvin"
,
"Glace"
,
"Gladbrook"
,
"Gladeville"
,
"Gladewater"
,
"Gladwin"
,
"Gladwyne"
,
"Glady"
,
"Glandorf"
,
"Glasco"
,
"Glasford"
,
"Glasgo"
,
"Glassboro"
,
"Glasser"
,
"Glassport"
,
"Glasston"
,
"Glastonbury"
,
"Glenallan"
,
"Glenallen"
,
"Glenarbor"
,
"Glenarm"
,
"Glenaubrey"
,
"Glenbeulah"
,
"Glenbrook"
,
"Glenburn"
,
"Glenburnie"
,
"Glencarbon"
,
"Glencliff"
,
"Glencoe"
,
"Glencross"
,
"Glendaniel"
,
"Glendean"
,
"Glendive"
,
"Glendo"
,
"Glendon"
,
"Glendora"
,
"Gleneaston"
,
"Glenecho"
,
"Glenelder"
,
"Glenellen"
,
"Glenellyn"
,
"Glenferris"
,
"Glenfield"
,
"Glenflora"
,
"Glenford"
,
"Glengary"
,
"Glenham"
,
"Glenhayes"
,
"Glenhead"
,
"Glenjean"
,
"Glenlyn"
,
"Glenmont"
,
"Glenmoore"
,
"Glenmora"
,
"Glenmorgan"
,
"Glennallen"
,
"Glenndale"
,
"Glennie"
,
"Glennville"
,
"Glenolden"
,
"Glenoma"
,
"Glenpool"
,
"Glenrio"
,
"Glenrose"
,
"Glenshaw"
,
"Glenside"
,
"Glenspey"
,
"Glentana"
,
"Glenullin"
,
"Glenview"
,
"Glenvil"
,
"Glenville"
,
"Glenwhite"
,
"Glenwild"
,
"Glenwillard"
,
"Glenwilton"
,
"Glenwood"
,
"Glorieta"
,
"Gloster"
,
"Glouster"
,
"Glover"
,
"Gloversville"
,
"Gloverville"
,
"Glyndon"
,
"Glynn"
,
"Gober"
,
"Gobler"
,
"Gobles"
,
"Godeffroy"
,
"Godley"
,
"Goehner"
,
"Goessel"
,
"Goetzville"
,
"Goffstown"
,
"Golconda"
,
"Goldbar"
,
"Goldbond"
,
"Goldendale"
,
"Goldfield"
,
"Goldonna"
,
"Goldrun"
,
"Goldsboro"
,
"Goldston"
,
"Goldthwaite"
,
"Goldvein"
,
"Goliad"
,
"Goltry"
,
"Golts"
,
"Golva"
,
"Gonvick"
,
"Goochland"
,
"Goodell"
,
"Goodfield"
,
"Goodhope"
,
"Goodhue"
,
"Gooding"
,
"Goodland"
,
"Goodson"
,
"Goodview"
,
"Goodville"
,
"Goodwater"
,
"Goodway"
,
"Goodwell"
,
"Goodwine"
,
"Goodyear"
,
"Gordo"
,
"Gordonsville"
,
"Gordonville"
,
"Goree"
,
"Goreville"
,
"Gorin"
,
"Gorman"
,
"Gormania"
,
"Gorum"
,
"Goshen"
,
"Gosport"
,
"Gotebo"
,
"Gotha"
,
"Gothenburg"
,
"Goudeau"
,
"Gough"
,
"Gouldbusk"
,
"Gouldsboro"
,
"Gouverneur"
,
"Gove"
,
"Gowanda"
,
"Gowen"
,
"Gower"
,
"Gowrie"
,
"Grabill"
,
"Gracemont"
,
"Graceville"
,
"Gracewood"
,
"Gracey"
,
"Gradyville"
,
"Graettinger"
,
"Graford"
,
"Grafton"
,
"Grahamsville"
,
"Grahn"
,
"Grainfield"
,
"Grambling"
,
"Gramercy"
,
"Gramling"
,
"Grampian"
,
"Granada"
,
"Granbury"
,
"Granby"
,
"Granger"
,
"Grangeville"
,
"Graniteville"
,
"Grannis"
,
"Grantham"
,
"Granton"
,
"Grants"
,
"Grantsboro"
,
"Grantsburg"
,
"Grantsdale"
,
"Grantsville"
,
"Granttown"
,
"Grantville"
,
"Grapeland"
,
"Grapeview"
,
"Grapeville"
,
"Grasonville"
,
"Grasston"
,
"Gratiot"
,
"Graton"
,
"Gratz"
,
"Gravelly"
,
"Gravette"
,
"Gravity"
,
"Grawn"
,
"Graycourt"
,
"Grayland"
,
"Grayling"
,
"Graymont"
,
"Graysville"
,
"Graytown"
,
"Grayville"
,
"Greeley"
,
"Greeleyville"
,
"Greenback"
,
"Greenbank"
,
"Greenbrier"
,
"Greenbush"
,
"Greendale"
,
"Greendell"
,
"Greeneville"
,
"Greenford"
,
"Greenhall"
,
"Greenhurst"
,
"Greenlane"
,
"Greenlawn"
,
"Greenleaf"
,
"Greenock"
,
"Greenport"
,
"Greensburg"
,
"Greensea"
,
"Greentown"
,
"Greenup"
,
"Greenvale"
,
"Greenview"
,
"Greenville"
,
"Greenwald"
,
"Greenway"
,
"Greig"
,
"Grenada"
,
"Grenloch"
,
"Grenola"
,
"Grenora"
,
"Grenville"
,
"Grethel"
,
"Gretna"
,
"Greybull"
,
"Greycliff"
,
"Gridley"
,
"Griffithville"
,
"Grifton"
,
"Griggsville"
,
"Grimesland"
,
"Grimsley"
,
"Grimstead"
,
"Grinnell"
,
"Grissom"
,
"Groesbeck"
,
"Grosseile"
,
"Grossetete"
,
"Grosvenordale"
,
"Grottoes"
,
"Groveland"
,
"Grovertown"
,
"Groves"
,
"Groveton"
,
"Grovetown"
,
"Grubbs"
,
"Grubville"
,
"Gruetli"
,
"Grulla"
,
"Grundy"
,
"Gruver"
,
"Grygla"
,
"Guadalupe"
,
"Guadalupita"
,
"Guage"
,
"Gualala"
,
"Guanica"
,
"Guasti"
,
"Guayama"
,
"Guayanilla"
,
"Guaynabo"
,
"Guerneville"
,
"Guerra"
,
"Guerrant"
,
"Gueydan"
,
"Guffey"
,
"Guiderock"
,
"Guilderland"
,
"Guin"
,
"Guinda"
,
"Guion"
,
"Gulfhammock"
,
"Gulfport"
,
"Gulliver"
,
"Gulston"
,
"Gumberry"
,
"Gunlock"
,
"Gunnison"
,
"Gunter"
,
"Guntersville"
,
"Guntown"
,
"Gurabo"
,
"Gurdon"
,
"Gurley"
,
"Gurnee"
,
"Gurney"
,
"Gusher"
,
"Gustine"
,
"Guston"
,
"Guttenberg"
,
"Guymon"
,
"Guys"
,
"Guysville"
,
"Guyton"
,
"Gwinn"
,
"Gwinner"
,
"Gwynedd"
,
"Gwynn"
,
"Gwynneville"
,
"Hachita"
,
"Hackensack"
,
"Hackettstown"
,
"Hackleburg"
,
"Haddam"
,
"Haddix"
,
"Haddonfield"
,
"Hadensville"
,
"Hadlock"
,
"Hadlyme"
,
"Hagaman"
,
"Hagan"
,
"Hagarstown"
,
"Hagarville"
,
"Hagerman"
,
"Hagerstown"
,
"Hahira"
,
"Hahnville"
,
"Haigler"
,
"Hailesboro"
,
"Hailey"
,
"Haileyville"
,
"Hainesport"
,
"Hakalau"
,
"Halbur"
,
"Halcottsville"
,
"Haldeman"
,
"Haledon"
,
"Haleiwa"
,
"Haleyville"
,
"Hallam"
,
"Hallandale"
,
"Halleck"
,
"Hallett"
,
"Hallettsville"
,
"Halliday"
,
"Hallie"
,
"Hallieford"
,
"Hallock"
,
"Hallowell"
,
"Halls"
,
"Hallsboro"
,
"Hallstead"
,
"Hallsville"
,
"Halltown"
,
"Hallwood"
,
"Halstad"
,
"Hamberg"
,
"Hambleton"
,
"Hamden"
,
"Hamel"
,
"Hamer"
,
"Hamersville"
,
"Hamler"
,
"Hamletsburg"
,
"Hammett"
,
"Hammon"
,
"Hammondsport"
,
"Hammondsville"
,
"Hammonton"
,
"Hampden"
,
"Hampstead"
,
"Hamptonville"
,
"Hamshire"
,
"Hana"
,
"Hanalei"
,
"Hanapepe"
,
"Hanceville"
,
"Handley"
,
"Handsom"
,
"Hankamer"
,
"Hankins"
,
"Hankinson"
,
"Hanksville"
,
"Hanlontown"
,
"Hannacroix"
,
"Hannaford"
,
"Hannastown"
,
"Hanoverton"
,
"Hansboro"
,
"Hansell"
,
"Hansford"
,
"Hanska"
,
"Hanston"
,
"Hansville"
,
"Haralson"
,
"Harbert"
,
"Harbeson"
,
"Harborside"
,
"Harborton"
,
"Harco"
,
"Hardaway"
,
"Hardburly"
,
"Hardeeville"
,
"Hardenville"
,
"Hardesty"
,
"Hardinsburg"
,
"Hardtner"
,
"Hardwick"
,
"Hardyville"
,
"Harford"
,
"Hargill"
,
"Harleigh"
,
"Harleton"
,
"Harleysville"
,
"Harleyville"
,
"Harlingen"
,
"Harlowton"
,
"Harman"
,
"Harmans"
,
"Harmonsburg"
,
"Harned"
,
"Harper"
,
"Harpersfield"
,
"Harpersville"
,
"Harperville"
,
"Harpster"
,
"Harpursville"
,
"Harrah"
,
"Harrell"
,
"Harrells"
,
"Harrellsville"
,
"Harrietta"
,
"Harrisonburg"
,
"Harrisonville"
,
"Harriston"
,
"Harristown"
,
"Harrisville"
,
"Harrod"
,
"Harrodsburg"
,
"Harrold"
,
"Harshaw"
,
"Hartfield"
,
"Hartington"
,
"Hartland"
,
"Hartleton"
,
"Hartline"
,
"Hartly"
,
"Harts"
,
"Hartsburg"
,
"Hartsdale"
,
"Hartsel"
,
"Hartselle"
,
"Hartsfield"
,
"Hartshorn"
,
"Hartshorne"
,
"Hartstown"
,
"Hartsville"
,
"Hartville"
,
"Hartwell"
,
"Hartwick"
,
"Hartwood"
,
"Harvel"
,
"Harveysburg"
,
"Harveyville"
,
"Harviell"
,
"Harwich"
,
"Harwichport"
,
"Harwick"
,
"Harwood"
,
"Haskell"
,
"Haskins"
,
"Haslet"
,
"Haslett"
,
"Hasse"
,
"Hassell"
,
"Haswell"
,
"Hatboro"
,
"Hatchechubbee"
,
"Hathorne"
,
"Hatillo"
,
"Hatley"
,
"Hattieville"
,
"Hatton"
,
"Haubstadt"
,
"Haughton"
,
"Hauppauge"
,
"Hauula"
,
"Havaco"
,
"Havelock"
,
"Havensville"
,
"Haverford"
,
"Haverstraw"
,
"Haviland"
,
"Havre"
,
"Hawarden"
,
"Hawesville"
,
"Hawi"
,
"Hawick"
,
"Hawkeye"
,
"Hawkinsville"
,
"Hawks"
,
"Hawleyville"
,
"Haworth"
,
"Haxtun"
,
"Haydenville"
,
"Hayesville"
,
"Haymarket"
,
"Haynesville"
,
"Hayneville"
,
"Haysi"
,
"Haysville"
,
"Hayti"
,
"Haywood"
,
"Hazelcrest"
,
"Hazelhurst"
,
"Hazelton"
,
"Hazelwood"
,
"Hazen"
,
"Hazlehurst"
,
"Hazlet"
,
"Hazleton"
,
"Headrick"
,
"Healdsburg"
,
"Healdton"
,
"Hearne"
,
"Heartwell"
,
"Heaters"
,
"Heathsville"
,
"Heaton"
,
"Heavener"
,
"Hebbronville"
,
"Heber"
,
"Hebert"
,
"Hebo"
,
"Hebron"
,
"Hecker"
,
"Hecla"
,
"Hedgesville"
,
"Hedley"
,
"Hedrick"
,
"Heflin"
,
"Hegins"
,
"Heidenheimer"
,
"Heidrick"
,
"Heilwood"
,
"Heimdal"
,
"Heiskell"
,
"Heislerville"
,
"Heisson"
,
"Helechawa"
,
"Helendale"
,
"Helenville"
,
"Helenwood"
,
"Helfenstein"
,
"Hellertown"
,
"Hellier"
,
"Helmer"
,
"Helmetta"
,
"Helmsburg"
,
"Helmuth"
,
"Helmville"
,
"Helotes"
,
"Helper"
,
"Heltonville"
,
"Hemet"
,
"Hemingford"
,
"Henagar"
,
"Hendley"
,
"Hendrix"
,
"Hendrum"
,
"Henefer"
,
"Henlawson"
,
"Hennepin"
,
"Hennessey"
,
"Henniker"
,
"Henning"
,
"Henrico"
,
"Henrieville"
,
"Henryetta"
,
"Henryton"
,
"Henryville"
,
"Hensel"
,
"Hensler"
,
"Hensley"
,
"Hensonville"
,
"Hephzibah"
,
"Hepler"
,
"Heppner"
,
"Hepzibah"
,
"Herbster"
,
"Herculaneum"
,
"Herington"
,
"Herlong"
,
"Hermansville"
,
"Hermanville"
,
"Herminie"
,
"Hermiston"
,
"Hermitage"
,
"Hermleigh"
,
"Hermon"
,
"Hernando"
,
"Herndon"
,
"Hernshaw"
,
"Herod"
,
"Herreid"
,
"Herrick"
,
"Herrin"
,
"Herrings"
,
"Herron"
,
"Herscher"
,
"Hersey"
,
"Hertel"
,
"Hertford"
,
"Hesperia"
,
"Hessel"
,
"Hessmer"
,
"Hesston"
,
"Hestand"
,
"Heth"
,
"Hetland"
,
"Hettick"
,
"Hettinger"
,
"Heuvelton"
,
"Hext"
,
"Heyburn"
,
"Heyworth"
,
"Hialeah"
,
"Hiawassee"
,
"Hibbing"
,
"Hibbs"
,
"Hickorywithe"
,
"Hicksville"
,
"Hico"
,
"Hiddenite"
,
"Higbee"
,
"Higden"
,
"Higdon"
,
"Higganum"
,
"Higginson"
,
"Higginsport"
,
"Higginsville"
,
"Highlands"
,
"Highlandville"
,
"Highmore"
,
"Highshoals"
,
"Highspire"
,
"Hightown"
,
"Hightstown"
,
"Highview"
,
"Highwood"
,
"Higley"
,
"Hihat"
,
"Hiko"
,
"Hiland"
,
"Hilda"
,
"Hildebran"
,
"Hildreth"
,
"Hilger"
,
"Hilham"
,
"Hill"
,
"Hillburn"
,
"Hiller"
,
"Hilliard"
,
"Hilliards"
,
"Hillisburg"
,
"Hillister"
,
"Hillrose"
,
"Hills"
,
"Hillsboro"
,
"Hillsborough"
,
"Hillsdale"
,
"Hillsville"
,
"Hilltown"
,
"Hillview"
,
"Hilmar"
,
"Hilo"
,
"Hiltons"
,
"Hima"
,
"Himrod"
,
"Hinckley"
,
"Hindman"
,
"Hindsboro"
,
"Hindsville"
,
"Hinesburg"
,
"Hineston"
,
"Hinesville"
,
"Hingham"
,
"Hinkle"
,
"Hinkley"
,
"Hinsdale"
,
"Hinton"
,
"Hiseville"
,
"Hissop"
,
"Hitchins"
,
"Hitchita"
,
"Hitterdal"
,
"Hiwasse"
,
"Hiwassee"
,
"Hixson"
,
"Hixton"
,
"Hobbsville"
,
"Hobgood"
,
"Hobson"
,
"Hobucken"
,
"Hochheim"
,
"Hockessin"
,
"Hockingport"
,
"Hockley"
,
"Hode"
,
"Hodgen"
,
"Hodgenville"
,
"Hoehne"
,
"Hoffmeister"
,
"Hogansburg"
,
"Hogansville"
,
"Hogeland"
,
"Hohenwald"
,
"Hohokus"
,
"Hoisington"
,
"Hokah"
,
"Holabird"
,
"Holcombe"
,
"Holdenville"
,
"Holder"
,
"Holderness"
,
"Holdingford"
,
"Holdrege"
,
"Holicong"
,
"Holladay"
,
"Hollandale"
,
"Hollansburg"
,
"Hollenberg"
,
"Holley"
,
"Holliday"
,
"Hollidaysburg"
,
"Hollins"
,
"Hollis"
,
"Holliston"
,
"Holloman"
,
"Hollowville"
,
"Hollsopple"
,
"Hollybush"
,
"Hollytree"
,
"Holmen"
,
"Holmesville"
,
"Holmsville"
,
"Holton"
,
"Holtsville"
,
"Holtville"
,
"Holtwood"
,
"Holyrood"
,
"Homedale"
,
"Homer"
,
"Homerville"
,
"Hometown"
,
"Homewood"
,
"Homeworth"
,
"Hominy"
,
"Homosassa"
,
"Honaker"
,
"Honaunau"
,
"Honeapath"
,
"Honeoye"
,
"Honesdale"
,
"Honeybrook"
,
"Honeyville"
,
"Honobia"
,
"Honokaa"
,
"Honomu"
,
"Honor"
,
"Honoraville"
,
"Hoodsport"
,
"Hooker"
,
"Hookerton"
,
"Hooks"
,
"Hookstown"
,
"Hoolehua"
,
"Hoopa"
,
"Hooper"
,
"Hoopeston"
,
"Hoople"
,
"Hooppole"
,
"Hoosick"
,
"Hooven"
,
"Hooversville"
,
"Hopatcong"
,
"Hopbottom"
,
"Hopedale"
,
"Hopehull"
,
"Hopeland"
,
"Hopeton"
,
"Hopewell"
,
"Hopkinsville"
,
"Hopkinton"
,
"Hopland"
,
"Hopwood"
,
"Hoquiam"
,
"Hordville"
,
"Horicon"
,
"Hormigueros"
,
"Hornbeak"
,
"Hornbeck"
,
"Hornbrook"
,
"Hornell"
,
"Horner"
,
"Hornersville"
,
"Hornick"
,
"Hornitos"
,
"Hornsby"
,
"Horntown"
,
"Horseheads"
,
"Horsepen"
,
"Horsham"
,
"Hortense"
,
"Hortonville"
,
"Hoschton"
,
"Hosford"
,
"Hoskins"
,
"Hoskinston"
,
"Hosmer"
,
"Hospers"
,
"Hosston"
,
"Hostetter"
,
"Hotchkiss"
,
"Hotevilla"
,
"Houck"
,
"Houlka"
,
"Houlton"
,
"Houma"
,
"Housatonic"
,
"Houstonia"
,
"Houtzdale"
,
"Hoven"
,
"Hovland"
,
"Howardstown"
,
"Howells"
,
"Howertons"
,
"Howes"
,
"Howland"
,
"Hoxeyville"
,
"Hoxie"
,
"Hoyleton"
,
"Hoytville"
,
"Hubbardston"
,
"Hubbardsville"
,
"Hubertus"
,
"Huddleston"
,
"Huddy"
,
"Hudgins"
,
"Hudsonville"
,
"Huey"
,
"Hueysville"
,
"Huger"
,
"Hugheston"
,
"Hughesville"
,
"Hughson"
,
"Hughsonville"
,
"Hugoton"
,
"Huguenot"
,
"Hulbert"
,
"Hulen"
,
"Hulett"
,
"Humacao"
,
"Humansville"
,
"Humarock"
,
"Humbird"
,
"Hume"
,
"Humeston"
,
"Hummelstown"
,
"Humnoke"
,
"Humphreys"
,
"Humptulips"
,
"Hungerford"
,
"Hunker"
,
"Hunnewell"
,
"Hunters"
,
"Huntersville"
,
"Huntertown"
,
"Huntingburg"
,
"Huntingdon"
,
"Huntingtown"
,
"Huntland"
,
"Huntly"
,
"Huntsburg"
,
"Hurdland"
,
"Hurdsfield"
,
"Hurleyville"
,
"Hurlock"
,
"Hurtsboro"
,
"Husk"
,
"Husser"
,
"Hustisford"
,
"Hustontown"
,
"Hustonville"
,
"Husum"
,
"Hutsonville"
,
"Huttig"
,
"Hutto"
,
"Huttonsville"
,
"Huxford"
,
"Hyampom"
,
"Hyannisport"
,
"Hyattsville"
,
"Hyattville"
,
"Hyden"
,
"Hydes"
,
"Hydesville"
,
"Hydetown"
,
"Hydeville"
,
"Hye"
,
"Hymera"
,
"Hyndman"
,
"Hyrum"
,
"Hysham"
,
"Iaeger"
,
"Ibapah"
,
"Icard"
,
"Ickesburg"
,
"Idabel"
,
"Idalia"
,
"Idalou"
,
"Idamay"
,
"Idanha"
,
"Idaville"
,
"Ider"
,
"Idledale"
,
"Idlewild"
,
"Idyllwild"
,
"Ignacio"
,
"Igo"
,
"Ihlen"
,
"Ijamsville"
,
"Ila"
,
"Iliamna"
,
"Iliff"
,
"Ilion"
,
"Illiopolis"
,
"Ilwaco"
,
"Imbler"
,
"Imboden"
,
"Imlay"
,
"Imlaystown"
,
"Imler"
,
"Immaculata"
,
"Immokalee"
,
"Imnaha"
,
"Imogene"
,
"Ina"
,
"Inavale"
,
"Inchelium"
,
"Independence"
,
"Indiahoma"
,
"Indianhead"
,
"Indianola"
,
"Indiantown"
,
"Indio"
,
"Indore"
,
"Inez"
,
"Ingalls"
,
"Ingle"
,
"Inglefield"
,
"Ingleside"
,
"Inglewood"
,
"Inglis"
,
"Ingold"
,
"Ingomar"
,
"Ingraham"
,
"Inkom"
,
"Inkster"
,
"Innis"
,
"Inola"
,
"Insko"
,
"Intercourse"
,
"Interlachen"
,
"Interlaken"
,
"Interlochen"
,
"Intervale"
,
"Inwood"
,
"Inyokern"
,
"Iola"
,
"Iona"
,
"Ione"
,
"Ionia"
,
"Ipava"
,
"Ipswich"
,
"Iraan"
,
"Irasburg"
,
"Iredell"
,
"Ireton"
,
"Irmo"
,
"Ironbelt"
,
"Irondale"
,
"Ironia"
,
"Irons"
,
"Ironsides"
,
"Ironton"
,
"Irrigon"
,
"Irvington"
,
"Irvona"
,
"Irwinville"
,
"Isaban"
,
"Isabela"
,
"Isanti"
,
"Iselin"
,
"Ishpeming"
,
"Islandton"
,
"Islesboro"
,
"Islesford"
,
"Isleta"
,
"Isleton"
,
"Islip"
,
"Ismay"
,
"Isola"
,
"Isom"
,
"Isonville"
,
"Issaquah"
,
"Istachatta"
,
"Itasca"
,
"Itmann"
,
"Ittabena"
,
"Iuka"
,
"Iva"
,
"Ivel"
,
"Ivesdale"
,
"Ivins"
,
"Ivor"
,
"Ivoryton"
,
"Ivydale"
,
"Ivyton"
,
"Ixonia"
,
"Jachin"
,
"Jackhorn"
,
"Jacksboro"
,
"Jacksonboro"
,
"Jacksonburg"
,
"Jacksonport"
,
"Jacksontown"
,
"Jacobsburg"
,
"Jacumba"
,
"Jadwin"
,
"Jaffrey"
,
"Jakin"
,
"Jal"
,
"Jamesburg"
,
"Jameson"
,
"Jamesport"
,
"Jamesstore"
,
"Jamesville"
,
"Jamieson"
,
"Jamison"
,
"Jamul"
,
"Janelew"
,
"Janesville"
,
"Jansen"
,
"Jarales"
,
"Jarbidge"
,
"Jaroso"
,
"Jarratt"
,
"Jarreau"
,
"Jarrell"
,
"Jarrettsville"
,
"Jarvisburg"
,
"Jasonville"
,
"Jayem"
,
"Jayess"
,
"Jayton"
,
"Jayuya"
,
"Jeanerette"
,
"Jeannette"
,
"Jeddo"
,
"Jeffers"
,
"Jeffersonton"
,
"Jellico"
,
"Jelm"
,
"Jemison"
,
"Jena"
,
"Jenison"
,
"Jenkinsburg"
,
"Jenkinsville"
,
"Jenkintown"
,
"Jenks"
,
"Jenner"
,
"Jennerstown"
,
"Jermyn"
,
"Jeromesville"
,
"Jerseyville"
,
"Jessieville"
,
"Jessup"
,
"Jesup"
,
"Jetersville"
,
"Jetmore"
,
"Jetson"
,
"Jigger"
,
"Jobstown"
,
"Jodie"
,
"Joelton"
,
"Joes"
,
"Joffre"
,
"Johnday"
,
"Johnsburg"
,
"Johnsonburg"
,
"Johnsonville"
,
"Joice"
,
"Joiner"
,
"Joinerville"
,
"Joliette"
,
"Jolley"
,
"Jolo"
,
"Jolon"
,
"Jonancy"
,
"Jonben"
,
"Jonesboro"
,
"Jonesborough"
,
"Jonesburg"
,
"Jonesport"
,
"Jonestown"
,
"Jonesville"
,
"Joplin"
,
"Joppa"
,
"Jordanville"
,
"Jourdanton"
,
"Juanadiaz"
,
"Jud"
,
"Juda"
,
"Judsonia"
,
"Julesburg"
,
"Juliaetta"
,
"Julian"
,
"Juliette"
,
"Juliustown"
,
"Juncos"
,
"Junedale"
,
"Juniata"
,
"Juntura"
,
"Justiceburg"
,
"Justin"
,
"Kaaawa"
,
"Kadoka"
,
"Kahlotus"
,
"Kahoka"
,
"Kahuku"
,
"Kahului"
,
"Kailua"
,
"Kailuakona"
,
"Kalaheo"
,
"Kalama"
,
"Kalaupapa"
,
"Kaleva"
,
"Kalida"
,
"Kalispell"
,
"Kalkaska"
,
"Kalona"
,
"Kalskag"
,
"Kalvesta"
,
"Kamas"
,
"Kamay"
,
"Kamiah"
,
"Kampsville"
,
"Kamrar"
,
"Kamuela"
,
"Kanab"
,
"Kanaranzi"
,
"Kanarraville"
,
"Kanawha"
,
"Kandiyohi"
,
"Kaneohe"
,
"Kaneville"
,
"Kannapolis"
,
"Kanona"
,
"Kanopolis"
,
"Kanorado"
,
"Kanosh"
,
"Kansasville"
,
"Kantner"
,
"Kapaa"
,
"Kapaau"
,
"Kapowsin"
,
"Karlin"
,
"Karlsruhe"
,
"Karlstad"
,
"Karluk"
,
"Karnack"
,
"Karnak"
,
"Karthaus"
,
"Karval"
,
"Kasbeer"
,
"Kasigluk"
,
"Kasilof"
,
"Kasota"
,
"Kasson"
,
"Katemcy"
,
"Kathryn"
,
"Katonah"
,
"Katy"
,
"Kaukauna"
,
"Kaumakani"
,
"Kaunakakai"
,
"Kaweah"
,
"Kawkawlin"
,
"Kaycee"
,
"Kayenta"
,
"Kaylor"
,
"Kaysville"
,
"Keaau"
,
"Kealakekua"
,
"Kealia"
,
"Keansburg"
,
"Kearney"
,
"Kearneysville"
,
"Kearny"
,
"Kearsarge"
,
"Keasbey"
,
"Keatchie"
,
"Keavy"
,
"Kechi"
,
"Keddie"
,
"Keedysville"
,
"Keeler"
,
"Keeline"
,
"Keene"
,
"Keenes"
,
"Keenesburg"
,
"Keensburg"
,
"Keeseville"
,
"Keewatin"
,
"Keezletown"
,
"Kegley"
,
"Keiser"
,
"Keisterville"
,
"Keithsburg"
,
"Keithville"
,
"Keizer"
,
"Kekaha"
,
"Kelayres"
,
"Keldron"
,
"Kelford"
,
"Kell"
,
"Kellerman"
,
"Kellerton"
,
"Kelliher"
,
"Kellnersville"
,
"Kellysville"
,
"Kellyton"
,
"Kellyville"
,
"Kelseyville"
,
"Kelso"
,
"Kelton"
,
"Kemah"
,
"Kemblesville"
,
"Kemmerer"
,
"Kempner"
,
"Kempster"
,
"Kempton"
,
"Kenai"
,
"Kenansville"
,
"Kendalia"
,
"Kendallville"
,
"Kendleton"
,
"Kendrick"
,
"Kenduskeag"
,
"Kenedy"
,
"Kenefic"
,
"Kenesaw"
,
"Kenilworth"
,
"Kenly"
,
"Kenmare"
,
"Kenna"
,
"Kennard"
,
"Kennebec"
,
"Kennebunk"
,
"Kennebunkport"
,
"Kennedale"
,
"Kennedyville"
,
"Kenner"
,
"Kennerdell"
,
"Kennesaw"
,
"Kennett"
,
"Kennewick"
,
"Kenosha"
,
"Kenova"
,
"Kensal"
,
"Kensett"
,
"Kentland"
,
"Kentuck"
,
"Kentwood"
,
"Kenvil"
,
"Kenvir"
,
"Kenwood"
,
"Keo"
,
"Keokee"
,
"Keokuk"
,
"Keosauqua"
,
"Keota"
,
"Kerens"
,
"Kerhonkson"
,
"Kerkhoven"
,
"Kerman"
,
"Kernersville"
,
"Kernville"
,
"Kerrick"
,
"Kerrville"
,
"Kersey"
,
"Kershaw"
,
"Keshena"
,
"Kesley"
,
"Keswick"
,
"Ketchum"
,
"Kettlersville"
,
"Kevil"
,
"Kewadin"
,
"Kewanee"
,
"Kewanna"
,
"Kewaskum"
,
"Kewaunee"
,
"Keyapaha"
,
"Keyesport"
,
"Keylargo"
,
"Keymar"
,
"Keyport"
,
"Keyser"
,
"Keysville"
,
"Keytesville"
,
"Kiahsville"
,
"Kidder"
,
"Kidron"
,
"Kief"
,
"Kiefer"
,
"Kiel"
,
"Kieler"
,
"Kiester"
,
"Kihei"
,
"Kila"
,
"Kilauea"
,
"Kilbourne"
,
"Kildare"
,
"Kilkenny"
,
"Killarney"
,
"Killawog"
,
"Killbuck"
,
"Killduff"
,
"Killeen"
,
"Killen"
,
"Killington"
,
"Killona"
,
"Kilmarnock"
,
"Kilmichael"
,
"Kiln"
,
"Kilsyth"
,
"Kimballton"
,
"Kimberton"
,
"Kimbolton"
,
"Kimmell"
,
"Kimmswick"
,
"Kimper"
,
"Kinards"
,
"Kincaid"
,
"Kincheloe"
,
"Kinde"
,
"Kinder"
,
"Kinderhook"
,
"Kingfield"
,
"Kingman"
,
"Kingmont"
,
"Kings"
,
"Kingsburg"
,
"Kingsdown"
,
"Kingsland"
,
"Kingsport"
,
"Kingstree"
,
"Kingsville"
,
"Kingwood"
,
"Kinmundy"
,
"Kinnear"
,
"Kinross"
,
"Kinsale"
,
"Kinsey"
,
"Kinsley"
,
"Kinsman"
,
"Kinston"
,
"Kinta"
,
"Kintnersville"
,
"Kintyre"
,
"Kinzers"
,
"Kipnuk"
,
"Kipton"
,
"Kirbyville"
,
"Kirkersville"
,
"Kirklin"
,
"Kirkman"
,
"Kirksey"
,
"Kirksville"
,
"Kirkville"
,
"Kirkwood"
,
"Kiron"
,
"Kirtland"
,
"Kirvin"
,
"Kirwin"
,
"Kismet"
,
"Kissimmee"
,
"Kistler"
,
"Kittanning"
,
"Kittery"
,
"Kittitas"
,
"Kittredge"
,
"Kittrell"
,
"Kitzmiller"
,
"Klamath"
,
"Klemme"
,
"Klickitat"
,
"Klingerstown"
,
"Klondike"
,
"Klossner"
,
"Kneeland"
,
"Knierim"
,
"Knifley"
,
"Knightdale"
,
"Knightsen"
,
"Knightstown"
,
"Knightsville"
,
"Knippa"
,
"Knobel"
,
"Knoblick"
,
"Knobnoster"
,
"Knoke"
,
"Knowlesville"
,
"Knoxboro"
,
"Knoxdale"
,
"Koeltztown"
,
"Kohler"
,
"Kokomo"
,
"Koleen"
,
"Koloa"
,
"Kona"
,
"Konawa"
,
"Koosharem"
,
"Kooskia"
,
"Koppel"
,
"Kopperl"
,
"Kopperston"
,
"Korbel"
,
"Koror"
,
"Kosciusko"
,
"Koshkonong"
,
"Kosrae"
,
"Kosse"
,
"Kossuth"
,
"Kotlik"
,
"Kountze"
,
"Kouts"
,
"Kraemer"
,
"Kranzburg"
,
"Kreamer"
,
"Kremmling"
,
"Kresgeville"
,
"Kress"
,
"Krum"
,
"Kualapuu"
,
"Kula"
,
"Kulm"
,
"Kulpmont"
,
"Kulpsville"
,
"Kuna"
,
"Kunia"
,
"Kunkle"
,
"Kunkletown"
,
"Kurten"
,
"Kurthwood"
,
"Kurtistown"
,
"Kurtz"
,
"Kuttawa"
,
"Kutztown"
,
"Kwethluk"
,
"Kwigillingok"
,
"Kyburz"
,
"Kylertown"
,
"Laager"
,
"Labadie"
,
"Labadieville"
,
"Labarge"
,
"LaBarre"
,
"LaBelle"
,
"Labolt"
,
"Lacamp"
,
"Lacarne"
,
"Lacassine"
,
"Laceyville"
,
"Lachine"
,
"Lackawaxen"
,
"Laclede"
,
"Lacombe"
,
"Lacon"
,
"Lacona"
,
"Laconia"
,
"Lacoochee"
,
"Lacoste"
,
"Lacota"
,
"Lacrescent"
,
"Lacygne"
,
"Ladd"
,
"Laddonia"
,
"Ladiesburg"
,
"Ladonia"
,
"Ladora"
,
"Ladson"
,
"Ladysmith"
,
"Lafarge"
,
"Lafargeville"
,
"Laferia"
,
"Lafferty"
,
"Lafitte"
,
"Lafollette"
,
"Lafontaine"
,
"Lafox"
,
"Lafrance"
,
"Lagrangeville"
,
"Lagro"
,
"Laguna"
,
"Lagunitas"
,
"Lahabra"
,
"Lahaina"
,
"Laharpe"
,
"Lahaska"
,
"Lahmansville"
,
"Lahoma"
,
"Laie"
,
"Laings"
,
"Laingsburg"
,
"Laird"
,
"Lairdsville"
,
"Lajas"
,
"Lajose"
,
"Lakin"
,
"Lakota"
,
"Laloma"
,
"Laluz"
,
"Lamadera"
,
"Lamarque"
,
"Lamartine"
,
"Lamberton"
,
"Lambertville"
,
"Lambric"
,
"Lambrook"
,
"Lambsburg"
,
"Lamero"
,
"Lamesa"
,
"Lamison"
,
"Lamoille"
,
"Lamoni"
,
"Lamont"
,
"Lamonte"
,
"Lamotte"
,
"Lamoure"
,
"Lampasas"
,
"Lampe"
,
"Lampeter"
,
"Lanagan"
,
"Lanark"
,
"Lancing"
,
"Landa"
,
"Landenberg"
,
"Lander"
,
"Landess"
,
"Landing"
,
"Landingville"
,
"Landisburg"
,
"Landisville"
,
"Lando"
,
"Landrum"
,
"Landville"
,
"Laneburg"
,
"Lanesboro"
,
"Lanesville"
,
"Lanett"
,
"Laneview"
,
"Laneville"
,
"Lanexa"
,
"Langdon"
,
"Langeloth"
,
"Langford"
,
"Langhorne"
,
"Langlois"
,
"Langston"
,
"Langsville"
,
"Langtry"
,
"Langworthy"
,
"Lanham"
,
"Lankin"
,
"Lannon"
,
"Lansdale"
,
"Lansdowne"
,
"Lanse"
,
"Lansford"
,
"Lantry"
,
"Laona"
,
"Laotto"
,
"Lapaz"
,
"Lapeer"
,
"Lapine"
,
"Lapryor"
,
"Lapwai"
,
"Laquey"
,
"Larchmont"
,
"Larchwood"
,
"Largo"
,
"Larimer"
,
"Larimore"
,
"Larned"
,
"Larose"
,
"Larrabee"
,
"Larslan"
,
"Larto"
,
"Larue"
,
"Larussell"
,
"Larwill"
,
"Lasal"
,
"Lasalle"
,
"Lascassas"
,
"Lashmeet"
,
"Lasker"
,
"Lasmarias"
,
"Lastrup"
,
"Latah"
,
"Latexo"
,
"Latham"
,
"Latimer"
,
"Laton"
,
"Latour"
,
"Latta"
,
"Lattimore"
,
"Latty"
,
"Laughlintown"
,
"Laupahoehoe"
,
"Laurelton"
,
"Laurelville"
,
"Laurens"
,
"Laurier"
,
"Laurinburg"
,
"Lavalette"
,
"Lavalle"
,
"Lavallette"
,
"Laveen"
,
"Lavelle"
,
"Lavergne"
,
"Laverkin"
,
"Laverne"
,
"Lavernia"
,
"Laveta"
,
"Lavilla"
,
"Lavina"
,
"Lavinia"
,
"Lavon"
,
"Lavonia"
,
"Lawai"
,
"Laward"
,
"Lawen"
,
"Lawler"
,
"Lawley"
,
"Lawndale"
,
"Lawnside"
,
"Lawrenceburg"
,
"Lawrenceville"
,
"Lawsonville"
,
"Lawtell"
,
"Lawtey"
,
"Lawton"
,
"Lawtons"
,
"Lawyersville"
,
"Layland"
,
"Laytonville"
,
"Lazbuddie"
,
"Lazear"
,
"Leachville"
,
"Leaday"
,
"Leadore"
,
"Leadville"
,
"Leadwood"
,
"Leakesville"
,
"Leakey"
,
"Leamington"
,
"Leary"
,
"Leasburg"
,
"Leatherwood"
,
"Leavittsburg"
,
"Lebam"
,
"Lebeau"
,
"Lebec"
,
"Lebo"
,
"Leburn"
,
"Lecanto"
,
"Leckie"
,
"Leckkill"
,
"Leckrone"
,
"Leclaire"
,
"Lecoma"
,
"Lecompton"
,
"Ledbetter"
,
"Lederach"
,
"Ledger"
,
"Ledgewood"
,
"Ledoux"
,
"Ledyard"
,
"Leechburg"
,
"Leeco"
,
"Leedey"
,
"Leemont"
,
"Leeper"
,
"Leesburg"
,
"Leesport"
,
"Leesville"
,
"Leet"
,
"Leeton"
,
"Leetonia"
,
"Leetsdale"
,
"Leevining"
,
"Leewood"
,
"Lefor"
,
"Lefors"
,
"Leggett"
,
"Legrand"
,
"Lehi"
,
"Lehighton"
,
"Lehr"
,
"Leicester"
,
"Leipsic"
,
"Leisenring"
,
"Leitchfield"
,
"Leiter"
,
"Leitersford"
,
"Leith"
,
"Leivasy"
,
"Lemars"
,
"Lemasters"
,
"Lemhi"
,
"Leming"
,
"Lemitar"
,
"Lemmon"
,
"Lemont"
,
"Lemoore"
,
"Lemoyen"
,
"Lemoyne"
,
"Lempster"
,
"Lenapah"
,
"Lengby"
,
"Lenhartsville"
,
"Lenni"
,
"Lennon"
,
"Lenoir"
,
"Lenora"
,
"Lenorah"
,
"Lenox"
,
"Lenoxdale"
,
"Lenoxville"
,
"Lentner"
,
"Lenzburg"
,
"Leola"
,
"Leoma"
,
"Leominster"
,
"Leonardsville"
,
"Leonardtown"
,
"Leonardville"
,
"Leonidas"
,
"Leonore"
,
"Leonville"
,
"Leopolis"
,
"Leota"
,
"Leoti"
,
"Lepanto"
,
"Lequire"
,
"Leraysville"
,
"Lerna"
,
"Lerona"
,
"Lerose"
,
"Lesage"
,
"Lesterville"
,
"Lesueur"
,
"Letart"
,
"Letcher"
,
"Letha"
,
"Letohatchee"
,
"Letona"
,
"Letts"
,
"Lettsworth"
,
"Leupp"
,
"Levan"
,
"Levant"
,
"Levasy"
,
"Levelland"
,
"Levelock"
,
"Leverett"
,
"Levering"
,
"Levittown"
,
"Lewellen"
,
"Lewes"
,
"Lewisberry"
,
"Lewisburg"
,
"Lewisetta"
,
"Lewisport"
,
"Lewiston"
,
"Lewistown"
,
"Lewisville"
,
"Lexa"
,
"Libby"
,
"Libertytown"
,
"Libertyville"
,
"Libuse"
,
"Licking"
,
"Lickingville"
,
"Lidderdale"
,
"Lidgerwood"
,
"Liebenthal"
,
"Lightfoot"
,
"Ligon"
,
"Ligonier"
,
"Liguori"
,
"Lihue"
,
"Likely"
,
"Lilbourn"
,
"Lilburn"
,
"Lilesville"
,
"Lille"
,
"Lillie"
,
"Lillington"
,
"Lilliwaup"
,
"Lilydale"
,
"Limaville"
,
"Limeport"
,
"Limington"
,
"Limon"
,
"Linch"
,
"Lincolndale"
,
"Lincolnton"
,
"Lincolnville"
,
"Lincroft"
,
"Lindale"
,
"Lindenhurst"
,
"Lindenwood"
,
"Lindley"
,
"Lindon"
,
"Lindrith"
,
"Lindsborg"
,
"Lindseyville"
,
"Lindside"
,
"Linesville"
,
"Lineville"
,
"Lingle"
,
"Lingleville"
,
"Linkwood"
,
"Linn"
,
"Linneus"
,
"Linton"
,
"Linville"
,
"Linwood"
,
"Lipan"
,
"Lisco"
,
"Liscomb"
,
"Lisman"
,
"Lismore"
,
"Lissie"
,
"Listie"
,
"Litchfield"
,
"Litchville"
,
"Literberry"
,
"Lithia"
,
"Lithonia"
,
"Lithopolis"
,
"Lititz"
,
"Littcarr"
,
"Littlefield"
,
"Littleport"
,
"Littlestown"
,
"Lively"
,
"Livonia"
,
"Lizella"
,
"Lizemores"
,
"Lizton"
,
"Llano"
,
"Llewellyn"
,
"Loa"
,
"Loachapoka"
,
"Loami"
,
"Lobata"
,
"Lobeco"
,
"Lobelville"
,
"Lochgelly"
,
"Lochloosa"
,
"Lochmere"
,
"Lockbourne"
,
"Lockeford"
,
"Lockesburg"
,
"Lockney"
,
"Lockport"
,
"Loco"
,
"Locustdale"
,
"Locustville"
,
"Loda"
,
"Lodgegrass"
,
"Lodi"
,
"Logandale"
,
"Logansport"
,
"Loganton"
,
"Loganville"
,
"Lohman"
,
"Lohn"
,
"Lohrville"
,
"Loiza"
,
"Loleta"
,
"Lolita"
,
"Lolo"
,
"Loma"
,
"Lomalinda"
,
"Lomamar"
,
"Loman"
,
"Lomax"
,
"Lometa"
,
"Lomira"
,
"Lomita"
,
"Lompoc"
,
"Lonaconing"
,
"Londonderry"
,
"Lonedell"
,
"Lonejack"
,
"Lonestar"
,
"Lonetree"
,
"Longbottom"
,
"Longdale"
,
"Longford"
,
"Longkey"
,
"Longlane"
,
"Longleaf"
,
"Longmeadow"
,
"Longmont"
,
"Longport"
,
"Longs"
,
"Longton"
,
"Longview"
,
"Longville"
,
"Longwood"
,
"Lonoke"
,
"Lonsdale"
,
"Loogootee"
,
"Lookeba"
,
"Looneyville"
,
"Lopeno"
,
"Lorado"
,
"Lorain"
,
"Loraine"
,
"Lorane"
,
"Loranger"
,
"Lordsburg"
,
"Loreauville"
,
"Lorena"
,
"Lorentz"
,
"Lorenzo"
,
"Loretto"
,
"Lorida"
,
"Lorimor"
,
"Loring"
,
"Loris"
,
"Lorman"
,
"Lorton"
,
"Lostant"
,
"Lostine"
,
"Lothair"
,
"Lothian"
,
"Lott"
,
"Lottsburg"
,
"Louann"
,
"Loudon"
,
"Loudonville"
,
"Louellen"
,
"Loughman"
,
"Louin"
,
"Louisburg"
,
"Louvale"
,
"Louviers"
,
"Lovejoy"
,
"Lovelaceville"
,
"Lovelady"
,
"Lovell"
,
"Lovelock"
,
"Lovely"
,
"Lovettsville"
,
"Loveville"
,
"Lovilia"
,
"Loving"
,
"Lovingston"
,
"Lovington"
,
"Lowake"
,
"Lowber"
,
"Lowden"
,
"Lowder"
,
"Lowellville"
,
"Lowes"
,
"Lowesville"
,
"Lowman"
,
"Lowmansville"
,
"Lowmoor"
,
"Lowndes"
,
"Lowndesboro"
,
"Lowndesville"
,
"Lowville"
,
"Loxahatchee"
,
"Loxley"
,
"Loyall"
,
"Loyalton"
,
"Loysburg"
,
"Loysville"
,
"Lozano"
,
"Luana"
,
"Lubec"
,
"Lublin"
,
"Lucama"
,
"Lucan"
,
"Lucasville"
,
"Lucedale"
,
"Lucien"
,
"Lucile"
,
"Lucinda"
,
"Luckey"
,
"Ludell"
,
"Ludington"
,
"Ludowici"
,
"Luebbering"
,
"Lueders"
,
"Lufkin"
,
"Lugoff"
,
"Lukeville"
,
"Lula"
,
"Luling"
,
"Lumberport"
,
"Lumberton"
,
"Lumpkin"
,
"Luna"
,
"Lundale"
,
"Lunenburg"
,
"Luning"
,
"Lupton"
,
"Luquillo"
,
"Luray"
,
"Lurgan"
,
"Lusby"
,
"Lusk"
,
"Lutcher"
,
"Lutesville"
,
"Luthersburg"
,
"Luthersville"
,
"Lutherville"
,
"Lutsen"
,
"Luttrell"
,
"Lutts"
,
"Luverne"
,
"Luxemburg"
,
"Luxor"
,
"Luxora"
,
"Luzerne"
,
"Lyburn"
,
"Lycoming"
,
"Lyerly"
,
"Lyford"
,
"Lykens"
,
"Lyles"
,
"Lyme"
,
"Lynbrook"
,
"Lynco"
,
"Lynd"
,
"Lyndeborough"
,
"Lyndell"
,
"Lynden"
,
"Lyndhurst"
,
"Lyndon"
,
"Lyndonville"
,
"Lyndora"
,
"Lynndyl"
,
"Lynnfield"
,
"Lynnville"
,
"Lynnwood"
,
"Lynwood"
,
"Lysander"
,
"Lysite"
,
"Lytle"
,
"Lytten"
,
"Lytton"
,
"Mabank"
,
"Mabelvale"
,
"Maben"
,
"Mabie"
,
"Mableton"
,
"Mabscott"
,
"Mabton"
,
"MacClenny"
,
"MacClesfield"
,
"MacDoel"
,
"MacDona"
,
"MacFarlan"
,
"MacKay"
,
"MacKeyville"
,
"Macatawa"
,
"Maceo"
,
"Machias"
,
"Machiasport"
,
"Machipongo"
,
"Macksburg"
,
"Macksinn"
,
"Macksville"
,
"Mackville"
,
"Macomb"
,
"Macungie"
,
"Macy"
,
"Madawaska"
,
"Maddock"
,
"Madelia"
,
"Madera"
,
"Madill"
,
"Madisonburg"
,
"Madisonville"
,
"Maeystown"
,
"Magalia"
,
"Magdalena"
,
"Magee"
,
"Magness"
,
"Mahaffey"
,
"Mahan"
,
"Mahaska"
,
"Maher"
,
"Mahnomen"
,
"Mahomet"
,
"Mahopac"
,
"Mahto"
,
"Mahtowa"
,
"Mahwah"
,
"Maida"
,
"Maidens"
,
"Maidsville"
,
"Mainesburg"
,
"Maineville"
,
"Maitland"
,
"Maize"
,
"Majuro"
,
"Makanda"
,
"Makawao"
,
"Makaweli"
,
"Makinen"
,
"Makoti"
,
"Malaga"
,
"Malakoff"
,
"Malcom"
,
"Malibu"
,
"Malin"
,
"Malinta"
,
"Maljamar"
,
"Mallie"
,
"Malmo"
,
"Malo"
,
"Maloneton"
,
"Malott"
,
"Maloy"
,
"Malvern"
,
"Malverne"
,
"Mamers"
,
"Mamou"
,
"Manahawkin"
,
"Manakinsabot"
,
"Manasquan"
,
"Manassa"
,
"Manassas"
,
"Manati"
,
"Manawa"
,
"Mancelona"
,
"Manchaca"
,
"Manchaug"
,
"Mancos"
,
"Mandan"
,
"Mandaree"
,
"Manderson"
,
"Mandeville"
,
"Mangham"
,
"Mango"
,
"Mangohick"
,
"Mangum"
,
"Manhasset"
,
"Manheim"
,
"Manilla"
,
"Manistee"
,
"Manistique"
,
"Manito"
,
"Manitou"
,
"Manitowoc"
,
"Mankato"
,
"Manlius"
,
"Manly"
,
"Mannboro"
,
"Mannford"
,
"Manning"
,
"Mannington"
,
"Mannschoice"
,
"Mannsville"
,
"Manokin"
,
"Manokotak"
,
"Manomet"
,
"Manorville"
,
"Manquin"
,
"Mansfield"
,
"Manson"
,
"Mansura"
,
"Mantachie"
,
"Mantador"
,
"Manteca"
,
"Mantee"
,
"Manteno"
,
"Manteo"
,
"Manter"
,
"Manti"
,
"Mantoloking"
,
"Manton"
,
"Mantorville"
,
"Mantua"
,
"Manvel"
,
"Manzanola"
,
"Mapaville"
,
"Maplecrest"
,
"Mapleshade"
,
"Maplesville"
,
"Mapleton"
,
"Mapleview"
,
"Mapleville"
,
"Maplewood"
,
"Mappsville"
,
"Maquoketa"
,
"Maquon"
,
"Maramec"
,
"Marana"
,
"Marblehead"
,
"Marbury"
,
"Marceline"
,
"Marcell"
,
"Marcella"
,
"Marcellus"
,
"Marchand"
,
"Marcola"
,
"Marcushook"
,
"Marengo"
,
"Marenisco"
,
"Marfa"
,
"Marfrance"
,
"Margaretville"
,
"Marianna"
,
"Mariastein"
,
"Mariba"
,
"Maribel"
,
"Maricao"
,
"Maricopa"
,
"Marienthal"
,
"Marienville"
,
"Marilla"
,
"Marinette"
,
"Maringouin"
,
"Marionville"
,
"Mariposa"
,
"Marissa"
,
"Markesan"
,
"Markle"
,
"Markleeville"
,
"Markleton"
,
"Markleville"
,
"Markleysburg"
,
"Marksville"
,
"Markville"
,
"Marland"
,
"Marlette"
,
"Marlinton"
,
"Marlow"
,
"Marlton"
,
"Marmaduke"
,
"Marmarth"
,
"Marmora"
,
"Marne"
,
"Maroa"
,
"Marquand"
,
"Marquez"
,
"Marrero"
,
"Marshallberg"
,
"Marshalltown"
,
"Marshallville"
,
"Marshessiding"
,
"Marshfield"
,
"Marshville"
,
"Marsing"
,
"Marsland"
,
"Marsteller"
,
"Marston"
,
"Martel"
,
"Martell"
,
"Martelle"
,
"Martensdale"
,
"Marthasville"
,
"Marthaville"
,
"Martindale"
,
"Martinsburg"
,
"Martinsdale"
,
"Martinsville"
,
"Martinton"
,
"Martville"
,
"Marvell"
,
"Maryalice"
,
"Maryd"
,
"Marydel"
,
"Marydell"
,
"Maryknoll"
,
"Marylhurst"
,
"Maryneal"
,
"Marysvale"
,
"Marysville"
,
"Maryus"
,
"Maryville"
,
"Mascot"
,
"Mascotte"
,
"Mascoutah"
,
"Mashpee"
,
"Maskell"
,
"Masontown"
,
"Masonville"
,
"Massapequa"
,
"Massena"
,
"Massillon"
,
"Masury"
,
"Matador"
,
"Matagorda"
,
"Matamoras"
,
"Matawan"
,
"Matewan"
,
"Matheny"
,
"Mather"
,
"Matherville"
,
"Matheson"
,
"Mathis"
,
"Mathiston"
,
"Matinicus"
,
"Matlock"
,
"Matoaka"
,
"Mattapoisett"
,
"Mattaponi"
,
"Mattawamkeag"
,
"Mattawan"
,
"Mattawana"
,
"Matteson"
,
"Mattituck"
,
"Mattoon"
,
"Mauckport"
,
"Maud"
,
"Maugansville"
,
"Mauk"
,
"Mauldin"
,
"Maumee"
,
"Maunabo"
,
"Maunie"
,
"Maupin"
,
"Maurepas"
,
"Maurertown"
,
"Mauricetown"
,
"Mauriceville"
,
"Maury"
,
"Mauston"
,
"Mavisdale"
,
"Maxatawny"
,
"Maxbass"
,
"Maxie"
,
"Maximo"
,
"Maxton"
,
"Maxwelton"
,
"Mayaguez"
,
"Maybee"
,
"Maybell"
,
"Maybeury"
,
"Maybrook"
,
"Maydelle"
,
"Mayersville"
,
"Mayesville"
,
"Mayetta"
,
"Mayfield"
,
"Mayhew"
,
"Mayking"
,
"Maylene"
,
"Maynardville"
,
"Mayodan"
,
"Maypearl"
,
"Mayport"
,
"Mays"
,
"Maysel"
,
"Maysfield"
,
"Mayslick"
,
"Maysville"
,
"Maytown"
,
"Mayview"
,
"Mayville"
,
"Maywood"
,
"Mazeppa"
,
"Mazie"
,
"Mazomanie"
,
"Mazon"
,
"McAdenville"
,
"McAdoo"
,
"McAfee"
,
"McAlester"
,
"McAlister"
,
"McAllen"
,
"McAlpin"
,
"McAndrews"
,
"McArthur"
,
"McBain"
,
"McBee"
,
"McBrides"
,
"McCalla"
,
"McCallsburg"
,
"McCamey"
,
"McCammon"
,
"McCanna"
,
"McCarley"
,
"McCarr"
,
"McCaskill"
,
"McCaulley"
,
"McCausland"
,
"McCaysville"
,
"McClave"
,
"McCleary"
,
"McClelland"
,
"McCloud"
,
"McClurg"
,
"McClusky"
,
"McColl"
,
"McComas"
,
"McComb"
,
"McCombs"
,
"McCondy"
,
"McConnells"
,
"McCook"
,
"McCool"
,
"McCordsville"
,
"McCrory"
,
"McCune"
,
"McCurtain"
,
"McDade"
,
"McDaniels"
,
"McDavid"
,
"McDermitt"
,
"McDonough"
,
"McDougal"
,
"McElhattan"
,
"McEwen"
,
"McEwensville"
,
"McFaddin"
,
"McFall"
,
"McFarlan"
,
"McGaheysville"
,
"McGehee"
,
"McGirk"
,
"McGrady"
,
"McGrann"
,
"McGraws"
,
"McGrew"
,
"McGuffey"
,
"McHenry"
,
"McIntire"
,
"McKean"
,
"McKenney"
,
"McKinnon"
,
"McKittrick"
,
"McKnightstown"
,
"McLain"
,
"McLeansboro"
,
"McLeansville"
,
"McLouth"
,
"McMechen"
,
"McMillin"
,
"McMinnville"
,
"McNabb"
,
"McNary"
,
"McNeal"
,
"McNeill"
,
"McQuady"
,
"McQueeney"
,
"McRae"
,
"McRoberts"
,
"McShan"
,
"McSherrystown"
,
"McVeigh"
,
"McVeytown"
,
"McVille"
,
"McWhorter"
,
"McWilliams"
,
"McKeesport"
,
"Meade"
,
"Meador"
,
"Meadowbrook"
,
"Meadows"
,
"Meadville"
,
"Meally"
,
"Means"
,
"Meansville"
,
"Mears"
,
"Mebane"
,
"Mechanicsburg"
,
"Mechanicstown"
,
"Mechanicville"
,
"Mecklenburg"
,
"Meckling"
,
"Mecosta"
,
"Medanales"
,
"Medaryville"
,
"Medfield"
,
"Mediapolis"
,
"Medina"
,
"Medinah"
,
"Medomak"
,
"Medon"
,
"Medora"
,
"Medway"
,
"Meeker"
,
"Meers"
,
"Meeteetse"
,
"Megargel"
,
"Meherrin"
,
"Mehoopany"
,
"Meigs"
,
"Mekinock"
,
"Mekoryuk"
,
"Melba"
,
"Melber"
,
"Melbeta"
,
"Melcroft"
,
"Melder"
,
"Meldrim"
,
"Melfa"
,
"Mellen"
,
"Mellenville"
,
"Mellette"
,
"Mellott"
,
"Mellwood"
,
"Melmore"
,
"Melrose"
,
"Melstone"
,
"Melvern"
,
"Melvindale"
,
"Mena"
,
"Menahga"
,
"Menan"
,
"Menard"
,
"Menasha"
,
"Mendenhall"
,
"Mendham"
,
"Mendocino"
,
"Mendon"
,
"Mendota"
,
"Menemsha"
,
"Menfro"
,
"Menifee"
,
"Menno"
,
"Meno"
,
"Menoken"
,
"Menominee"
,
"Menomonie"
,
"Mentcle"
,
"Mentmore"
,
"Mentone"
,
"Meppen"
,
"Meraux"
,
"Merced"
,
"Mercedita"
,
"Mercersburg"
,
"Merchantville"
,
"Meredithville"
,
"Meredosia"
,
"Mereta"
,
"Meridale"
,
"Meriden"
,
"Meridianville"
,
"Merigold"
,
"Merino"
,
"Merkel"
,
"Mermentau"
,
"Merna"
,
"Merom"
,
"Merrick"
,
"Merricourt"
,
"Merrifield"
,
"Merrillan"
,
"Merrimac"
,
"Merriman"
,
"Merrittstown"
,
"Merrouge"
,
"Merryville"
,
"Mershon"
,
"Mertens"
,
"Merton"
,
"Mertzon"
,
"Mertztown"
,
"Mesaverde"
,
"Mescalero"
,
"Mesena"
,
"Meservey"
,
"Meshoppen"
,
"Mesick"
,
"Mesilla"
,
"Mesita"
,
"Meta"
,
"Metairie"
,
"Metaline"
,
"Metamora"
,
"Metcalfe"
,
"Methow"
,
"Metter"
,
"Metuchen"
,
"Metz"
,
"Mexia"
,
"Meyersdale"
,
"Meyersville"
,
"Miamisburg"
,
"Miamitown"
,
"Miamiville"
,
"Micanopy"
,
"Micaville"
,
"Miccosukee"
,
"Michie"
,
"Michigamme"
,
"Mickleton"
,
"Middlebass"
,
"Middleboro"
,
"Middlebourne"
,
"Middlebrook"
,
"Middleburg"
,
"Middleburgh"
,
"Middlefield"
,
"Middleport"
,
"Middlesboro"
,
"Middleville"
,
"Midfield"
,
"Midkiff"
,
"Midlothian"
,
"Midpines"
,
"Midvale"
,
"Midville"
,
"Mifflin"
,
"Mifflinburg"
,
"Mifflintown"
,
"Mifflinville"
,
"Mikado"
,
"Mikana"
,
"Milaca"
,
"Milam"
,
"Milano"
,
"Milanville"
,
"Milbank"
,
"Milburn"
,
"Milesburg"
,
"Milesville"
,
"Miley"
,
"Milfay"
,
"Milford"
,
"Milladore"
,
"Millboro"
,
"Millbrae"
,
"Millbrook"
,
"Millburn"
,
"Millbury"
,
"Milldale"
,
"Milledgeville"
,
"Millen"
,
"Millers"
,
"Millersburg"
,
"Millersport"
,
"Millerstown"
,
"Millersville"
,
"Millerton"
,
"Millerville"
,
"Millfield"
,
"Millhall"
,
"Millheim"
,
"Millhousen"
,
"Millican"
,
"Milligan"
,
"Milliken"
,
"Millington"
,
"Millinocket"
,
"Millis"
,
"Millmont"
,
"Millport"
,
"Millrift"
,
"Millry"
,
"Millsap"
,
"Millsboro"
,
"Millshoals"
,
"Millstadt"
,
"Millston"
,
"Milltown"
,
"Millville"
,
"Millwood"
,
"Milmay"
,
"Milmine"
,
"Milner"
,
"Milnesand"
,
"Milnesville"
,
"Milnor"
,
"Milo"
,
"Milpitas"
,
"Milroy"
,
"Milton"
,
"Miltona"
,
"Miltonvale"
,
"Mima"
,
"Mimbres"
,
"Mims"
,
"Mina"
,
"Minatare"
,
"Minburn"
,
"Minco"
,
"Minden"
,
"Mindoro"
,
"Minelamotte"
,
"Mineola"
,
"Minersville"
,
"Minetto"
,
"Mineville"
,
"Minford"
,
"Mingo"
,
"Mingoville"
,
"Mingus"
,
"Minier"
,
"Minneola"
,
"Minneota"
,
"Minnetonka"
,
"Minnewaukan"
,
"Minoa"
,
"Minocqua"
,
"Minong"
,
"Minonk"
,
"Minooka"
,
"Minotola"
,
"Minster"
,
"Minter"
,
"Minto"
,
"Minturn"
,
"Mio"
,
"Miquon"
,
"Miraloma"
,
"Miramonte"
,
"Misenheimer"
,
"Mishawaka"
,
"Mishicot"
,
"Miston"
,
"Mitchells"
,
"Mitchellsburg"
,
"Mitchellville"
,
"Mittie"
,
"Mize"
,
"Mizpah"
,
"Moab"
,
"Moapa"
,
"Moatsville"
,
"Mobeetie"
,
"Moberly"
,
"Mobjack"
,
"Moca"
,
"Mocksville"
,
"Moclips"
,
"Modale"
,
"Modena"
,
"Modeste"
,
"Modesttown"
,
"Modoc"
,
"Moffat"
,
"Moffett"
,
"Moffit"
,
"Mogadore"
,
"Mohall"
,
"Mohnton"
,
"Mohrsville"
,
"Moira"
,
"Mojave"
,
"Mokane"
,
"Mokena"
,
"Moko"
,
"Molalla"
,
"Molena"
,
"Molina"
,
"Molino"
,
"Momence"
,
"Monaca"
,
"Monahans"
,
"Monango"
,
"Monaville"
,
"Monclova"
,
"Moncure"
,
"Mondamin"
,
"Mondovi"
,
"Monee"
,
"Monessen"
,
"Moneta"
,
"Monett"
,
"Monetta"
,
"Monette"
,
"Mongo"
,
"Monhegan"
,
"Monico"
,
"Monkton"
,
"Monon"
,
"Monona"
,
"Monongah"
,
"Monoville"
,
"Monponsett"
,
"Monroeton"
,
"Monroeville"
,
"Monsey"
,
"Monson"
,
"Moodus"
,
"Moodys"
,
"Mooers"
,
"Moorcroft"
,
"Moorefield"
,
"Mooreland"
,
"Mooresboro"
,
"Mooresburg"
,
"Moorestown"
,
"Mooresville"
,
"Mooreton"
,
"Mooreville"
,
"Moorhead"
,
"Moorland"
,
"Moorman"
,
"Mooseheart"
,
"Moosup"
,
"Mora"
,
"Moraga"
,
"Morann"
,
"Morattico"
,
"Moreauville"
,
"Morehead"
,
"Morehouse"
,
"Morenci"
,
"Moretown"
,
"Morganfield"
,
"Morganton"
,
"Morgantown"
,
"Morganville"
,
"Morganza"
,
"Moriah"
,
"Moriches"
,
"Morland"
,
"Moro"
,
"Moroni"
,
"Morovis"
,
"Morral"
,
"Morrice"
,
"Morrilton"
,
"Morrisdale"
,
"Morrisonville"
,
"Morriston"
,
"Morrisville"
,
"Morrowville"
,
"Morven"
,
"Morvin"
,
"Mosby"
,
"Mosca"
,
"Moseley"
,
"Moselle"
,
"Moshannon"
,
"Mosheim"
,
"Mosherville"
,
"Mosier"
,
"Mosinee"
,
"Mosquero"
,
"Mossville"
,
"Mossyrock"
,
"Mott"
,
"Mottville"
,
"Moultonboro"
,
"Moultrie"
,
"Mounds"
,
"Moundsville"
,
"Moundville"
,
"Mousie"
,
"Mouthcard"
,
"Moville"
,
"Moweaqua"
,
"Mowrystown"
,
"Moxahala"
,
"Moxee"
,
"Moyers"
,
"Moyock"
,
"Mozelle"
,
"Mozier"
,
"Mtbaldy"
,
"Muenster"
,
"Mukilteo"
,
"Mukwonago"
,
"Muldoon"
,
"Muldraugh"
,
"Muldrow"
,
"Muleshoe"
,
"Mulga"
,
"Mulhall"
,
"Mulino"
,
"Mulkeytown"
,
"Mullan"
,
"Mullens"
,
"Mulliken"
,
"Mullin"
,
"Mullins"
,
"Mullinville"
,
"Mulvane"
,
"Muncy"
,
"Munday"
,
"Mundelein"
,
"Munden"
,
"Munford"
,
"Munfordville"
,
"Munger"
,
"Munising"
,
"Munith"
,
"Munnsville"
,
"Munsonville"
,
"Murchison"
,
"Murdo"
,
"Murdock"
,
"Murfreesboro"
,
"Murphys"
,
"Murphysboro"
,
"Murraysville"
,
"Murrayville"
,
"Murrieta"
,
"Murrysville"
,
"Murtaugh"
,
"Muscadine"
,
"Muscatine"
,
"Muscoda"
,
"Muscotah"
,
"Musella"
,
"Muskego"
,
"Muskogee"
,
"Mustoe"
,
"Myerstown"
,
"Myersville"
,
"Mylo"
,
"Myrtlewood"
,
"Myton"
,
"Naalehu"
,
"Nabb"
,
"Naches"
,
"Nachusa"
,
"Naco"
,
"Nacoochee"
,
"Nada"
,
"Nadeau"
,
"Nageezi"
,
"Nagshead"
,
"Naguabo"
,
"Nahant"
,
"Nahma"
,
"Nahunta"
,
"Nakina"
,
"Naknek"
,
"Nallen"
,
"Nampa"
,
"Nanafalia"
,
"Nanjemoy"
,
"Nankin"
,
"Nanticoke"
,
"Nantyglo"
,
"Nanuet"
,
"Naoma"
,
"Napa"
,
"Napakiak"
,
"Napanoch"
,
"Napavine"
,
"Naper"
,
"Naperville"
,
"Napier"
,
"Napoleonville"
,
"Naponee"
,
"Nappanee"
,
"Naranjito"
,
"Naravisa"
,
"Narberth"
,
"Nardin"
,
"Narka"
,
"Narrows"
,
"Narrowsburg"
,
"Naruna"
,
"Narvon"
,
"Naselle"
,
"Nashoba"
,
"Nashotah"
,
"Nashport"
,
"Nashwauk"
,
"Nason"
,
"Nassawadox"
,
"Natalbany"
,
"Natalia"
,
"Nathalie"
,
"Nathrop"
,
"Natick"
,
"Natoma"
,
"Naturita"
,
"Naubinway"
,
"Naugatuck"
,
"Nauvoo"
,
"Navarre"
,
"Navasota"
,
"Navesink"
,
"Naxera"
,
"Naylor"
,
"Naytahwaush"
,
"Nazlini"
,
"Neafus"
,
"Neapolis"
,
"Neavitt"
,
"Nebo"
,
"Necedah"
,
"Neche"
,
"Neches"
,
"Nederland"
,
"Nedrow"
,
"Needles"
,
"Needmore"
,
"Needville"
,
"Neely"
,
"Neelyton"
,
"Neelyville"
,
"Neenah"
,
"Neeses"
,
"Neffs"
,
"Negaunee"
,
"Negley"
,
"Negreet"
,
"Nehalem"
,
"Nehawka"
,
"Neihart"
,
"Neillsville"
,
"Neilton"
,
"Nekoma"
,
"Nekoosa"
,
"Neligh"
,
"Nellis"
,
"Nelliston"
,
"Nellysford"
,
"Nelse"
,
"Nelsonia"
,
"Nelsonville"
,
"Nemacolin"
,
"Nemaha"
,
"Nemo"
,
"Nemours"
,
"Nenzel"
,
"Neodesha"
,
"Neoga"
,
"Neola"
,
"Neopit"
,
"Neosho"
,
"Neotsu"
,
"Nephi"
,
"Neponset"
,
"Nerinx"
,
"Nerstrand"
,
"Nesbit"
,
"Nesconset"
,
"Nescopeck"
,
"Neshkoro"
,
"Nesmith"
,
"Nespelem"
,
"Nesquehoning"
,
"Netawaka"
,
"Netcong"
,
"Nettie"
,
"Nettleton"
,
"Neversink"
,
"Neville"
,
"Nevis"
,
"Nevisdale"
,
"Ney"
,
"Niangua"
,
"Niantic"
,
"Niarada"
,
"Nicasio"
,
"Niceville"
,
"Nicholasville"
,
"Nicholville"
,
"Nickelsville"
,
"Nickerson"
,
"Nicktown"
,
"Nicolaus"
,
"Nicollet"
,
"Nicut"
,
"Nielsville"
,
"Nikep"
,
"Nikiski"
,
"Nikolski"
,
"Niland"
,
"Niles"
,
"Nilwood"
,
"Nimitz"
,
"Ninde"
,
"Ninilchik"
,
"Ninnekah"
,
"Niobrara"
,
"Niota"
,
"Niotaze"
,
"Nipomo"
,
"Nisbet"
,
"Nisswa"
,
"Nisula"
,
"Nitro"
,
"Nittayuma"
,
"Niverville"
,
"Niwot"
,
"Nixa"
,
"Nobleboro"
,
"Noblesville"
,
"Nobleton"
,
"Nocatee"
,
"Nocona"
,
"Noctor"
,
"Nodaway"
,
"Nogal"
,
"Nogales"
,
"Nokesville"
,
"Nokomis"
,
"Nolanville"
,
"Nolensville"
,
"Noma"
,
"Nome"
,
"Nonantum"
,
"Nondalton"
,
"Nooksack"
,
"Noonan"
,
"Norborne"
,
"Norcatur"
,
"Norco"
,
"Norcross"
,
"Norden"
,
"Nordheim"
,
"Nordland"
,
"Nordman"
,
"Norene"
,
"Norge"
,
"Norlina"
,
"Normalville"
,
"Normangee"
,
"Normanna"
,
"Normantown"
,
"Norphlet"
,
"Norridgewock"
,
"Norristown"
,
"Nortonville"
,
"Norvell"
,
"Norvelt"
,
"Norwell"
,
"Norwood"
,
"Notasulga"
,
"Noti"
,
"Notrees"
,
"Nottawa"
,
"Nottoway"
,
"Notus"
,
"Novato"
,
"Novi"
,
"Novinger"
,
"Nowata"
,
"Noxapater"
,
"Noxen"
,
"Noxon"
,
"Noyes"
,
"Nuangola"
,
"Nubieber"
,
"Nucla"
,
"Nuevo"
,
"Numa"
,
"Numidia"
,
"Numine"
,
"Nunapitchuk"
,
"Nunda"
,
"Nunez"
,
"Nunica"
,
"Nunn"
,
"Nunnelly"
,
"Nuremberg"
,
"Nutrioso"
,
"Nuttsville"
,
"Nyac"
,
"Nyack"
,
"Nyssa"
,
"Oacoma"
,
"Oakbluffs"
,
"Oakboro"
,
"Oakdale"
,
"Oakes"
,
"Oakesdale"
,
"Oakfield"
,
"Oakford"
,
"Oakhall"
,
"Oakham"
,
"Oakhurst"
,
"Oaklawn"
,
"Oaklyn"
,
"Oakman"
,
"Oakmont"
,
"Oaks"
,
"Oakton"
,
"Oaktown"
,
"Oakvale"
,
"Oakview"
,
"Oakville"
,
"Oark"
,
"Oatman"
,
"Obernburg"
,
"Oberon"
,
"Obert"
,
"Obion"
,
"Obrien"
,
"Ocala"
,
"Ocate"
,
"Occoquan"
,
"Oceana"
,
"Oceano"
,
"Oceanport"
,
"Oceanview"
,
"Oceanville"
,
"Oceola"
,
"Ochelata"
,
"Ocheyedan"
,
"Ochopee"
,
"Ocilla"
,
"Ocoee"
,
"Oconee"
,
"Oconomowoc"
,
"Oconto"
,
"Ocotillo"
,
"Ocracoke"
,
"Odanah"
,
"Odebolt"
,
"Odell"
,
"Odem"
,
"Oden"
,
"Odenton"
,
"Odenville"
,
"Odon"
,
"Odonnell"
,
"Odum"
,
"Oelrichs"
,
"Oelwein"
,
"Ofallon"
,
"Offerle"
,
"Offerman"
,
"Offutt"
,
"Ogallah"
,
"Ogallala"
,
"Ogdensburg"
,
"Ogema"
,
"Ogilvie"
,
"Oglala"
,
"Oglesby"
,
"Oglethorpe"
,
"Ogunquit"
,
"Ohatchee"
,
"Ohiopyle"
,
"Ohiowa"
,
"Ohley"
,
"Ohlman"
,
"Oilmont"
,
"Oilton"
,
"Oiltrough"
,
"Oilville"
,
"Ojai"
,
"Okabena"
,
"Okahumpka"
,
"Okanogan"
,
"Okarche"
,
"Okaton"
,
"Okauchee"
,
"Okawville"
,
"Okean"
,
"Okeana"
,
"Okeechobee"
,
"Okeene"
,
"Okemah"
,
"Okemos"
,
"Oketo"
,
"Oklaunion"
,
"Oklawaha"
,
"Oklee"
,
"Okmulgee"
,
"Okoboji"
,
"Okolona"
,
"Okreek"
,
"Oktaha"
,
"Ola"
,
"Olalla"
,
"Olamon"
,
"Olancha"
,
"Olanta"
,
"Olar"
,
"Olathe"
,
"Olaton"
,
"Olcott"
,
"Oldham"
,
"Olds"
,
"Olean"
,
"Olema"
,
"Oley"
,
"Oliveburg"
,
"Olivehurst"
,
"Oliverea"
,
"Olivet"
,
"Olla"
,
"Ollie"
,
"Olmito"
,
"Olmitz"
,
"Olmstead"
,
"Olmsted"
,
"Olmstedville"
,
"Olney"
,
"Olpe"
,
"Olsburg"
,
"Olton"
,
"Olustee"
,
"Olyphant"
,
"Omak"
,
"Omar"
,
"Omena"
,
"Omer"
,
"Omro"
,
"Ona"
,
"Onaga"
,
"Onaka"
,
"Onalaska"
,
"Onamia"
,
"Onancock"
,
"Onarga"
,
"Onawa"
,
"Onaway"
,
"Onchiota"
,
"Oneals"
,
"Oneco"
,
"Onego"
,
"Oneill"
,
"Onekama"
,
"Onemo"
,
"Oneonta"
,
"Ong"
,
"Onia"
,
"Onida"
,
"Onley"
,
"Ono"
,
"Onslow"
,
"Onsted"
,
"Ontonagon"
,
"Ookala"
,
"Oolitic"
,
"Oologah"
,
"Ooltewah"
,
"Oostburg"
,
"Opalocka"
,
"Opdyke"
,
"Opelika"
,
"Opelousas"
,
"Opheim"
,
"Ophelia"
,
"Ophir"
,
"Opolis"
,
"Opp"
,
"Oquawka"
,
"Oquossoc"
,
"Ora"
,
"Oradell"
,
"Oran"
,
"Orangeburg"
,
"Orangefield"
,
"Orangevale"
,
"Orangeville"
,
"Oraville"
,
"Orbisonia"
,
"Orcas"
,
"Ord"
,
"Orderville"
,
"Ordway"
,
"Oreana"
,
"Orefield"
,
"Oregonia"
,
"Oreland"
,
"Orem"
,
"Orford"
,
"Orfordville"
,
"Orgas"
,
"Orick"
,
"Orinda"
,
"Oriska"
,
"Oriskany"
,
"Orla"
,
"Orland"
,
"Orlean"
,
"Orlinda"
,
"Orma"
,
"Ormsby"
,
"Orocovis"
,
"Orondo"
,
"Oronoco"
,
"Oronogo"
,
"Orosi"
,
"Orovada"
,
"Oroville"
,
"Orrick"
,
"Orrin"
,
"Orrington"
,
"Orrstown"
,
"Orrtanna"
,
"Orrum"
,
"Orrville"
,
"Orson"
,
"Orting"
,
"Ortley"
,
"Ortonville"
,
"Orwigsburg"
,
"Osage"
,
"Osakis"
,
"Osawatomie"
,
"Osburn"
,
"Osceola"
,
"Osco"
,
"Oscoda"
,
"Oshoto"
,
"Oshtemo"
,
"Oskaloosa"
,
"Osmond"
,
"Osnabrock"
,
"Osseo"
,
"Ossian"
,
"Ossineke"
,
"Ossining"
,
"Ossipee"
,
"Osteen"
,
"Osterburg"
,
"Osterville"
,
"Oswegatchie"
,
"Oswego"
,
"Osyka"
,
"Otego"
,
"Otho"
,
"Otisco"
,
"Otisville"
,
"Otley"
,
"Oto"
,
"Otoe"
,
"Otsego"
,
"Otterbein"
,
"Ottertail"
,
"Otterville"
,
"Ottine"
,
"Ottosen"
,
"Ottoville"
,
"Ottsville"
,
"Ottumwa"
,
"Otway"
,
"Otwell"
,
"Ouaquaga"
,
"Ouray"
,
"Outing"
,
"Outlook"
,
"Ouzinkie"
,
"Ovalo"
,
"Ovando"
,
"Ovapa"
,
"Overbrook"
,
"Overgaard"
,
"Overly"
,
"Overpeck"
,
"Overton"
,
"Ovett"
,
"Oviedo"
,
"Owaneco"
,
"Owanka"
,
"Owasco"
,
"Owasso"
,
"Owatonna"
,
"Owego"
,
"Owen"
,
"Owendale"
,
"Owensboro"
,
"Owensburg"
,
"Owensville"
,
"Owenton"
,
"Owings"
,
"Owingsville"
,
"Owlshead"
,
"Owosso"
,
"Owyhee"
,
"Oxbow"
,
"Oxly"
,
"Oyens"
,
"Oysterville"
,
"Ozan"
,
"Ozawkie"
,
"Ozona"
,
"Paauhau"
,
"Paauilo"
,
"Pachuta"
,
"Pacifica"
,
"Packwaukee"
,
"Packwood"
,
"Pacoima"
,
"Pacolet"
,
"Paden"
,
"Padroni"
,
"Paducah"
,
"Pageland"
,
"Pageton"
,
"Paguate"
,
"Pahala"
,
"Pahoa"
,
"Pahokee"
,
"Pahrump"
,
"Paia"
,
"Paicines"
,
"Paige"
,
"Painesdale"
,
"Painesville"
,
"Paintbank"
,
"Painter"
,
"Paintlick"
,
"Painton"
,
"Paintsville"
,
"Paisley"
,
"Pala"
,
"Palacios"
,
"Palatka"
,
"Palco"
,
"Palenville"
,
"Palisades"
,
"Pallmall"
,
"Palmcoast"
,
"Palmdale"
,
"Palmdesert"
,
"Palmer"
,
"Palmerdale"
,
"Palmersville"
,
"Palmerton"
,
"Paloalto"
,
"Palocedro"
,
"Paloma"
,
"Palopinto"
,
"Palouse"
,
"Paloverde"
,
"Paluxy"
,
"Pamplico"
,
"Pamplin"
,
"Pana"
,
"Panaca"
,
"Pangburn"
,
"Panguitch"
,
"Pannamaria"
,
"Panola"
,
"Panora"
,
"Pansey"
,
"Pantego"
,
"Paola"
,
"Paonia"
,
"Papaikou"
,
"Papineau"
,
"Paradis"
,
"Paragonah"
,
"Paragould"
,
"Parcoal"
,
"Pardeesville"
,
"Pardeeville"
,
"Parishville"
,
"Parkdale"
,
"Parker"
,
"Parkerford"
,
"Parkersburg"
,
"Parkesburg"
,
"Parkhall"
,
"Parkin"
,
"Parkman"
,
"Parksley"
,
"Parkston"
,
"Parksville"
,
"Parkton"
,
"Parkville"
,
"Parlier"
,
"Parlin"
,
"Parma"
,
"Parmele"
,
"Parmelee"
,
"Parnell"
,
"Paron"
,
"Parowan"
,
"Parrott"
,
"Parrottsville"
,
"Parryville"
,
"Parshall"
,
"Parsippany"
,
"Parsonsburg"
,
"Partlow"
,
"Pascagoula"
,
"Pasco"
,
"Pascoag"
,
"Pascola"
,
"Paskenta"
,
"Passadumkeag"
,
"Passumpsic"
,
"Pataskala"
,
"Patchogue"
,
"Pateros"
,
"Patillas"
,
"Patoka"
,
"Paton"
,
"Patricksburg"
,
"Patten"
,
"Pattison"
,
"Pattonsburg"
,
"Pattonville"
,
"Paulden"
,
"Paulding"
,
"Paulina"
,
"Paullina"
,
"Paulsboro"
,
"Paupack"
,
"Pavillion"
,
"Pavo"
,
"Pawhuska"
,
"Pawlet"
,
"Pawling"
,
"Pawnee"
,
"Pawneerock"
,
"Pawpaw"
,
"Paxico"
,
"Paxinos"
,
"Paxton"
,
"Paxtonville"
,
"Payette"
,
"Paynesville"
,
"Payneville"
,
"Payson"
,
"Peacham"
,
"Peachbottom"
,
"Peachland"
,
"Peapack"
,
"Pearblossom"
,
"Pearcy"
,
"Pearisburg"
,
"Pearland"
,
"Pearlington"
,
"Pearsall"
,
"Peaster"
,
"Pebworth"
,
"Pecatonica"
,
"Peckville"
,
"Peconic"
,
"Pedricktown"
,
"Peebles"
,
"Peedee"
,
"Peekskill"
,
"Peell"
,
"Peerless"
,
"Peetz"
,
"Peever"
,
"Peggs"
,
"Pegram"
,
"Pejepscot"
,
"Pekin"
,
"Pelahatchie"
,
"Pelion"
,
"Pelkie"
,
"Pella"
,
"Pellston"
,
"Pellville"
,
"Pelsor"
,
"Pelzer"
,
"Pemaquid"
,
"Pemberton"
,
"Pemberville"
,
"Pembina"
,
"Pembine"
,
"Penalosa"
,
"Penargyl"
,
"Penasco"
,
"Pender"
,
"Pendergrass"
,
"Pendleton"
,
"Pendroy"
,
"Penfield"
,
"Pengilly"
,
"Penhook"
,
"Penitas"
,
"Penland"
,
"Pennellville"
,
"Pennington"
,
"Pennlaird"
,
"Pennock"
,
"Pennsauken"
,
"Pennsboro"
,
"Pennsburg"
,
"Pennsville"
,
"Pennville"
,
"Pennyan"
,
"Penobscot"
,
"Penokee"
,
"Penrod"
,
"Penryn"
,
"Pentress"
,
"Pentwater"
,
"Penuelas"
,
"Penwell"
,
"Peoples"
,
"Peosta"
,
"Peotone"
,
"Pepeekeo"
,
"Pepin"
,
"Pepperell"
,
"Pequabuck"
,
"Pequannock"
,
"Pequea"
,
"Peralta"
,
"Perdido"
,
"Perham"
,
"Peridot"
,
"Perkasie"
,
"Perkinston"
,
"Perkinsville"
,
"Perks"
,
"Perley"
,
"Pernell"
,
"Perrin"
,
"Perrineville"
,
"Perrinton"
,
"Perris"
,
"Perronville"
,
"Perryhall"
,
"Perryman"
,
"Perryopolis"
,
"Perrysburg"
,
"Perrysville"
,
"Perryton"
,
"Perryville"
,
"Pescadero"
,
"Peshastin"
,
"Peshtigo"
,
"Pesotum"
,
"Petaca"
,
"Petaluma"
,
"Peterboro"
,
"Peterborough"
,
"Peterman"
,
"Petersham"
,
"Peterstown"
,
"Petoskey"
,
"Petrey"
,
"Petrolia"
,
"Petros"
,
"Pettibone"
,
"Pettigrew"
,
"Pettisville"
,
"Pettit"
,
"Pettus"
,
"Pevely"
,
"Pewamo"
,
"Pewaukee"
,
"Peyton"
,
"Peytona"
,
"Peytonsburg"
,
"Pfafftown"
,
"Pfeifer"
,
"Pflugerville"
,
"Pharoah"
,
"Pharr"
,
"Pheba"
,
"Phelan"
,
"Phenix"
,
"Philadelphia"
,
"Philipp"
,
"Philippi"
,
"Philipsburg"
,
"Phillipsburg"
,
"Phillipsville"
,
"Philmont"
,
"Philo"
,
"Philomath"
,
"Philomont"
,
"Philpot"
,
"Phippsburg"
,
"Phoenixville"
,
"Piasa"
,
"Picacho"
,
"Picher"
,
"Pickens"
,
"Pickerington"
,
"Pickrell"
,
"Pickstown"
,
"Pickton"
,
"Picorivera"
,
"Piedra"
,
"Piercefield"
,
"Pierceton"
,
"Pierceville"
,
"Piercy"
,
"Piermont"
,
"Pierpont"
,
"Pierron"
,
"Pierz"
,
"Pietown"
,
"Piffard"
,
"Piggott"
,
"Piketon"
,
"Pikeville"
,
"Pilger"
,
"Pillager"
,
"Pilottown"
,
"Pima"
,
"Pimento"
,
"Pinckard"
,
"Pinckney"
,
"Pinckneyville"
,
"Pinconning"
,
"Pindall"
,
"Pinebank"
,
"Pinebluffs"
,
"Pinebrook"
,
"Pinebush"
,
"Pinecliffe"
,
"Pinecrest"
,
"Pinedale"
,
"Pinehall"
,
"Pineknot"
,
"Pineland"
,
"Pineola"
,
"Pinetops"
,
"Pinetown"
,
"Pinetta"
,
"Pineview"
,
"Pineville"
,
"Pinewood"
,
"Pineywoods"
,
"Pingree"
,
"Pinola"
,
"Pinole"
,
"Pinon"
,
"Pinopolis"
,
"Pinson"
,
"Pioche"
,
"Pioneertown"
,
"Pipersville"
,
"Pipestem"
,
"Pipestone"
,
"Pippapasses"
,
"Piqua"
,
"Pirtleville"
,
"Piru"
,
"Piseco"
,
"Pisek"
,
"Pisgah"
,
"Pitcher"
,
"Pitkin"
,
"Pitsburg"
,
"Pitts"
,
"Pittsboro"
,
"Pittsburg"
,
"Pittsford"
,
"Pittstown"
,
"Pittsview"
,
"Pittsville"
,
"Pixley"
,
"Placedo"
,
"Placentia"
,
"Placerville"
,
"Placida"
,
"Placitas"
,
"Plains"
,
"Plainsboro"
,
"Plainview"
,
"Plainville"
,
"Plainwell"
,
"Plaisted"
,
"Plaistow"
,
"Planada"
,
"Plankinton"
,
"Plano"
,
"Plantersville"
,
"Plantsville"
,
"Platina"
,
"Plattekill"
,
"Plattenville"
,
"Platter"
,
"Platteville"
,
"Plattsburg"
,
"Plattsburgh"
,
"Plattsmouth"
,
"Plaucheville"
,
"Pleasantdale"
,
"Pleasanton"
,
"Pleasantville"
,
"Pleasureville"
,
"Pledger"
,
"Plentywood"
,
"Plessis"
,
"Plevna"
,
"Pluckemin"
,
"Plumerville"
,
"Plummer"
,
"Plumtree"
,
"Plumville"
,
"Plympton"
,
"Poca"
,
"Pocahontas"
,
"Pocasset"
,
"Pocatello"
,
"Pocola"
,
"Pocopson"
,
"Poestenkill"
,
"Polacca"
,
"Polkton"
,
"Polkville"
,
"Pollocksville"
,
"Pollok"
,
"Polson"
,
"Polvadera"
,
"Pomaria"
,
"Pomerene"
,
"Pomeroy"
,
"Pomeroyton"
,
"Pomfret"
,
"Ponape"
,
"Ponca"
,
"Ponchatoula"
,
"Ponderay"
,
"Ponderosa"
,
"Ponemah"
,
"Poneto"
,
"Ponsford"
,
"Pontotoc"
,
"Pooler"
,
"Poolesville"
,
"Poolville"
,
"Popejoy"
,
"Poplarville"
,
"Poquonock"
,
"Porum"
,
"Posen"
,
"Poseyville"
,
"Poskin"
,
"Postelle"
,
"Poston"
,
"Postville"
,
"Poteau"
,
"Potecasi"
,
"Poteet"
,
"Poth"
,
"Potosi"
,
"Potrero"
,
"Potsdam"
,
"Potter"
,
"Pottersville"
,
"Potterville"
,
"Pottsboro"
,
"Pottstown"
,
"Pottsville"
,
"Potwin"
,
"Poughquag"
,
"Poulan"
,
"Poulsbo"
,
"Poultney"
,
"Poway"
,
"Powderhorn"
,
"Powderly"
,
"Powellsville"
,
"Powellton"
,
"Powellville"
,
"Powersite"
,
"Powersville"
,
"Powhatan"
,
"Powhattan"
,
"Pownal"
,
"Poyen"
,
"Poynette"
,
"Poynor"
,
"Poyntelle"
,
"Poysippi"
,
"Prather"
,
"Pratts"
,
"Prattsburg"
,
"Prattshollow"
,
"Prattsville"
,
"Prattville"
,
"Preble"
,
"Premont"
,
"Prenter"
,
"Prentiss"
,
"Presho"
,
"Presidio"
,
"Prestonsburg"
,
"Prewitt"
,
"Pricedale"
,
"Prichard"
,
"Priddy"
,
"Primghar"
,
"Princeville"
,
"Princewick"
,
"Prineville"
,
"Pringle"
,
"Prinsburg"
,
"Printer"
,
"Pritchett"
,
"Proberta"
,
"Procious"
,
"Proctorsville"
,
"Proctorville"
,
"Progreso"
,
"Prole"
,
"Prompton"
,
"Prophetstown"
,
"Prosperity"
,
"Prosser"
,
"Protection"
,
"Protem"
,
"Protivin"
,
"Provencal"
,
"Providence"
,
"Provo"
,
"Pruden"
,
"Prudenville"
,
"Prue"
,
"Pryor"
,
"Pryse"
,
"Puckett"
,
"Puertoreal"
,
"Pukwana"
,
"Pulcifer"
,
"Pulteney"
,
"Pultneyville"
,
"Puncheon"
,
"Pungoteague"
,
"Punxsutawney"
,
"Puposky"
,
"Purcellville"
,
"Purdin"
,
"Purdon"
,
"Purdum"
,
"Purdy"
,
"Purdys"
,
"Purgitsville"
,
"Purlear"
,
"Purling"
,
"Purmela"
,
"Pursglove"
,
"Purvis"
,
"Puryear"
,
"Putnamville"
,
"Putney"
,
"Puunene"
,
"Puxico"
,
"Puyallup"
,
"Pyatt"
,
"Pylesville"
,
"Pyote"
,
"Pyrites"
,
"Quakake"
,
"Quakerstreet"
,
"Quakertown"
,
"Quanah"
,
"Quapaw"
,
"Quarryville"
,
"Quartzsite"
,
"Quasqueton"
,
"Quebeck"
,
"Quebradillas"
,
"Quechee"
,
"Queenanne"
,
"Queenstown"
,
"Quemado"
,
"Quenemo"
,
"Questa"
,
"Quicksburg"
,
"Quilcene"
,
"Quimby"
,
"Quinault"
,
"Quinby"
,
"Quincy"
,
"Quinebaug"
,
"Quinlan"
,
"Quinnesec"
,
"Quinnimont"
,
"Quinque"
,
"Quinter"
,
"Quinton"
,
"Quinwood"
,
"Quitaque"
,
"Quitman"
,
"Qulin"
,
"Quogue"
,
"Raceland"
,
"Racine"
,
"Rackerby"
,
"Radcliff"
,
"Radford"
,
"Radisson"
,
"Radnor"
,
"Radom"
,
"Raeford"
,
"Ragland"
,
"Ragley"
,
"Rago"
,
"Ragsdale"
,
"Rahway"
,
"Raiford"
,
"Rainelle"
,
"Rainier"
,
"Rains"
,
"Rainsville"
,
"Ralls"
,
"Ramage"
,
"Ramah"
,
"Ramer"
,
"Ramey"
,
"Ramona"
,
"Ramsay"
,
"Ramseur"
,
"Ranburne"
,
"Ranchester"
,
"Rancocas"
,
"Randalia"
,
"Randallstown"
,
"Randle"
,
"Randleman"
,
"Randlett"
,
"Randsburg"
,
"Rangeley"
,
"Rangely"
,
"Ranger"
,
"Ransomville"
,
"Ranson"
,
"Rantoul"
,
"Rapelje"
,
"Raphine"
,
"Rapidan"
,
"Rarden"
,
"Ratcliff"
,
"Rathdrum"
,
"Raton"
,
"Rattan"
,
"Ravena"
,
"Ravencliff"
,
"Ravendale"
,
"Ravenden"
,
"Ravenel"
,
"Ravenna"
,
"Ravensdale"
,
"Ravenswood"
,
"Ravenwood"
,
"Ravia"
,
"Ravinia"
,
"Rawl"
,
"Rawlings"
,
"Rawlins"
,
"Rawson"
,
"Raybrook"
,
"Rayland"
,
"Rayle"
,
"Raymondville"
,
"Raymore"
,
"Rayne"
,
"Raynesford"
,
"Raynham"
,
"Raysal"
,
"Rayville"
,
"Raywick"
,
"Raywood"
,
"Rea"
,
"Reader"
,
"Readfield"
,
"Reading"
,
"Readington"
,
"Readlyn"
,
"Readsboro"
,
"Readstown"
,
"Readyville"
,
"Realitos"
,
"Reamstown"
,
"Reardan"
,
"Reasnor"
,
"Rebersburg"
,
"Rebuck"
,
"Rectortown"
,
"Redan"
,
"Redart"
,
"Redash"
,
"Redbank"
,
"Redbanks"
,
"Redby"
,
"Redcliff"
,
"Redcrest"
,
"Reddell"
,
"Reddick"
,
"Redding"
,
"Redfield"
,
"Redford"
,
"Redfox"
,
"Redhook"
,
"Redig"
,
"Redkey"
,
"Redlands"
,
"Redlion"
,
"Redmon"
,
"Redondo"
,
"Redowl"
,
"Redrock"
,
"Redstar"
,
"Redvale"
,
"Redwater"
,
"Redway"
,
"Redwing"
,
"Reeder"
,
"Reeders"
,
"Reedley"
,
"Reeds"
,
"Reedsburg"
,
"Reedsport"
,
"Reedsville"
,
"Reedville"
,
"Reelsville"
,
"Reeseville"
,
"Reesville"
,
"Reevesville"
,
"Reform"
,
"Refton"
,
"Refugio"
,
"Regan"
,
"Register"
,
"Rehobeth"
,
"Rehoboth"
,
"Rehrersburg"
,
"Reidsville"
,
"Reidville"
,
"Reinbeck"
,
"Reinholds"
,
"Reisterstown"
,
"Reklaw"
,
"Reliance"
,
"Rembert"
,
"Remer"
,
"Remlap"
,
"Remsen"
,
"Remsenburg"
,
"Renalara"
,
"Renfrew"
,
"Renick"
,
"Renner"
,
"Reno"
,
"Renovo"
,
"Rentiesville"
,
"Renton"
,
"Rentz"
,
"Renville"
,
"Renwick"
,
"Repton"
,
"Resaca"
,
"Reseda"
,
"Retsof"
,
"Reva"
,
"Revelo"
,
"Revillo"
,
"Revloc"
,
"Rew"
,
"Rewey"
,
"Rexburg"
,
"Rexford"
,
"Rexmont"
,
"Rexville"
,
"Reydell"
,
"Reydon"
,
"Reyno"
,
"Reynoldsburg"
,
"Reynoldsville"
,
"Rhame"
,
"Rheems"
,
"Rhinebeck"
,
"Rhinecliff"
,
"Rhinehart"
,
"Rhineland"
,
"Rhinelander"
,
"Rhoadesville"
,
"Rhodelia"
,
"Rhodell"
,
"Rhodesdale"
,
"Rhodhiss"
,
"Rialto"
,
"Ribera"
,
"Riceboro"
,
"Ricetown"
,
"Riceville"
,
"Richardsville"
,
"Richardton"
,
"Richburg"
,
"Richey"
,
"Richeyville"
,
"Richford"
,
"Richland"
,
"Richlands"
,
"Richmonddale"
,
"Richmondville"
,
"Richton"
,
"Richvale"
,
"Richview"
,
"Richville"
,
"Richwood"
,
"Richwoods"
,
"Ricketts"
,
"Rickman"
,
"Rickreall"
,
"Riddlesburg"
,
"Riddleton"
,
"Riderwood"
,
"Ridgecrest"
,
"Ridgedale"
,
"Ridgefield"
,
"Ridgeland"
,
"Ridgeley"
,
"Ridgely"
,
"Ridgeview"
,
"Ridgeville"
,
"Ridgeway"
,
"Ridgewood"
,
"Ridott"
,
"Riegelsville"
,
"Riegelwood"
,
"Rienzi"
,
"Riesel"
,
"Rifton"
,
"Rigby"
,
"Riggins"
,
"Rileyville"
,
"Rillito"
,
"Rillton"
,
"Rimersburg"
,
"Rimini"
,
"Rinard"
,
"Rincon"
,
"Rindge"
,
"Riner"
,
"Rineyville"
,
"Ringgold"
,
"Ringle"
,
"Ringling"
,
"Ringoes"
,
"Ringold"
,
"Ringsted"
,
"Ringtown"
,
"Ringwood"
,
"Rion"
,
"Riparius"
,
"Ripon"
,
"Rippey"
,
"Ripplemead"
,
"Rippon"
,
"Ririe"
,
"Risco"
,
"Rison"
,
"Ritner"
,
"Rittman"
,
"Ritzville"
,
"Riva"
,
"Riverdale"
,
"Riveredge"
,
"Riverhead"
,
"Riverton"
,
"Rivervale"
,
"Riverview"
,
"Rives"
,
"Rivesville"
,
"Rixeyville"
,
"Rixford"
,
"Roachdale"
,
"Roann"
,
"Roanoke"
,
"Roark"
,
"Robards"
,
"Robbinston"
,
"Robbinsville"
,
"Robeline"
,
"Robersonville"
,
"Robertlee"
,
"Robertsburg"
,
"Robertsdale"
,
"Robertsville"
,
"Robesonia"
,
"Robinette"
,
"Robins"
,
"Robinsonville"
,
"Robson"
,
"Robstown"
,
"Roby"
,
"Roca"
,
"Rochdale"
,
"Rochelle"
,
"Rocheport"
,
"Rochert"
,
"Rochford"
,
"Rociada"
,
"Rockdale"
,
"Rockfall"
,
"Rockfield"
,
"Rockhall"
,
"Rockham"
,
"Rockholds"
,
"Rockhouse"
,
"Rockingham"
,
"Rocklin"
,
"Rockmart"
,
"Rockport"
,
"Rockton"
,
"Rockvale"
,
"Rockview"
,
"Rockville"
,
"Rockwall"
,
"Rockwood"
,
"Rodanthe"
,
"Roderfield"
,
"Rodessa"
,
"Rodman"
,
"Roduco"
,
"Roebling"
,
"Roff"
,
"Rogerson"
,
"Rogersville"
,
"Roggen"
,
"Rohrersville"
,
"Rolesville"
,
"Rolette"
,
"Rolfe"
,
"Rolla"
,
"Rollin"
,
"Rollingstone"
,
"Rollinsford"
,
"Rollinsville"
,
"Roma"
,
"Romayor"
,
"Rombauer"
,
"Romney"
,
"Ronan"
,
"Ronceverte"
,
"Ronco"
,
"Ronda"
,
"Ronkonkoma"
,
"Ronks"
,
"Roopville"
,
"Rootstown"
,
"Roper"
,
"Ropesville"
,
"Rosalia"
,
"Rosamond"
,
"Rosanky"
,
"Rosario"
,
"Rosburg"
,
"Roscoe"
,
"Roscommon"
,
"Roseau"
,
"Roseboom"
,
"Roseboro"
,
"Roseburg"
,
"Rosedale"
,
"Roselawn"
,
"Roselle"
,
"Rosemead"
,
"Rosemont"
,
"Rosendale"
,
"Rosenhayn"
,
"Roseville"
,
"Rosewood"
,
"Rosharon"
,
"Rosholt"
,
"Rosiclare"
,
"Rosie"
,
"Rosine"
,
"Roslyn"
,
"Rosman"
,
"Rossburg"
,
"Rosser"
,
"Rossiter"
,
"Rosslyn"
,
"Rossmore"
,
"Rosston"
,
"Rossville"
,
"Roswell"
,
"Rota"
,
"Rotan"
,
"Rothbury"
,
"Rothsay"
,
"Rothville"
,
"Rougemont"
,
"Rougon"
,
"Roundo"
,
"Roundrock"
,
"Rouseville"
,
"Rouzerville"
,
"Rover"
,
"Rowan"
,
"Rowesville"
,
"Rowlesburg"
,
"Rowlett"
,
"Rowletts"
,
"Roxana"
,
"Roxboro"
,
"Roxie"
,
"Roxobel"
,
"Roxton"
,
"Royalton"
,
"Royersford"
,
"Royston"
,
"Rozel"
,
"Rozet"
,
"Rubicon"
,
"Ruckersville"
,
"Rudd"
,
"Rueter"
,
"Rufe"
,
"Ruffin"
,
"Ruffsdale"
,
"Rugby"
,
"Ruidoso"
,
"Ruleville"
,
"Rulo"
,
"Rumely"
,
"Rumney"
,
"Rumsey"
,
"Rumson"
,
"Runa"
,
"Runnells"
,
"Runnemede"
,
"Rupert"
,
"Ruralhall"
,
"Rushford"
,
"Rushland"
,
"Rushsylvania"
,
"Rushville"
,
"Ruskin"
,
"Ruso"
,
"Russellton"
,
"Russellville"
,
"Russiaville"
,
"Rustburg"
,
"Ruston"
,
"Rutherfordton"
,
"Rutheron"
,
"Ruthton"
,
"Ruthven"
,
"Ruthville"
,
"Rydal"
,
"Ryde"
,
"Ryderwood"
,
"Ryland"
,
"Sabael"
,
"Sabanahoyos"
,
"Sabanaseca"
,
"Sabattus"
,
"Sabetha"
,
"Sabillasville"
,
"Sabin"
,
"Sabinal"
,
"Sabinsville"
,
"Sabula"
,
"Sacaton"
,
"Saco"
,
"Sacul"
,
"Sadieville"
,
"Sadorus"
,
"Sadsburyville"
,
"Saegertown"
,
"Saffell"
,
"Safford"
,
"Sagamore"
,
"Sagaponack"
,
"Sagle"
,
"Sagola"
,
"Saguache"
,
"Sahuarita"
,
"Saipan"
,
"Salado"
,
"Salamanca"
,
"Saldee"
,
"Salem"
,
"Salemburg"
,
"Salesville"
,
"Salford"
,
"Salfordville"
,
"Salida"
,
"Salinas"
,
"Salineno"
,
"Salineville"
,
"Salitpa"
,
"Salix"
,
"Salkum"
,
"Salley"
,
"Sallis"
,
"Sallisaw"
,
"Salol"
,
"Salome"
,
"Salterpath"
,
"Salters"
,
"Saltgum"
,
"Saltillo"
,
"Saltlick"
,
"Saltsburg"
,
"Saltville"
,
"Saluda"
,
"Salvisa"
,
"Salyer"
,
"Salyersville"
,
"Samantha"
,
"Samaria"
,
"Samburg"
,
"Samnorwood"
,
"Sapulpa"
,
"Saragosa"
,
"Sarahann"
,
"Sarahsville"
,
"Saraland"
,
"Saranac"
,
"Sarcoxie"
,
"Sardinia"
,
"Sardis"
,
"Sarepta"
,
"Sargeant"
,
"Sargents"
,
"Sargentville"
,
"Sarita"
,
"Sarles"
,
"Sarona"
,
"Saronville"
,
"Sartell"
,
"Sarton"
,
"Sarver"
,
"Sasabe"
,
"Sasakwa"
,
"Saspamco"
,
"Sasser"
,
"Satanta"
,
"Satartia"
,
"Satsop"
,
"Satsuma"
,
"Sattley"
,
"Saucier"
,
"Saugatuck"
,
"Saugerties"
,
"Saugus"
,
"Saukville"
,
"Saulsbury"
,
"Saum"
,
"Saunderstown"
,
"Saunemin"
,
"Sauquoit"
,
"Sausalito"
,
"Sautee"
,
"Savanna"
,
"Saverton"
,
"Savery"
,
"Savona"
,
"Savonburg"
,
"Sawyerville"
,
"Saxapahaw"
,
"Saxe"
,
"Saxeville"
,
"Saxis"
,
"Saxonburg"
,
"Saxton"
,
"Saybrook"
,
"Saylorsburg"
,
"Sayner"
,
"Sayre"
,
"Sayreville"
,
"Sayville"
,
"Scalf"
,
"Scammon"
,
"Scandia"
,
"Scappoose"
,
"Scarbro"
,
"Scarville"
,
"Schaghticoke"
,
"Schaller"
,
"Schaumburg"
,
"Scheller"
,
"Schellsburg"
,
"Schenevus"
,
"Schenley"
,
"Schererville"
,
"Schertz"
,
"Schlater"
,
"Schleswig"
,
"Schley"
,
"Schnecksville"
,
"Schoharie"
,
"Schriever"
,
"Schulenburg"
,
"Schulter"
,
"Schurz"
,
"Schuylerville"
,
"Schwertner"
,
"Scio"
,
"Sciota"
,
"Scipio"
,
"Scituate"
,
"Scobey"
,
"Scooba"
,
"Scottdale"
,
"Scottown"
,
"Scotts"
,
"Scottsboro"
,
"Scottsburg"
,
"Scottsmoor"
,
"Scottsville"
,
"Scottville"
,
"Screven"
,
"Scribner"
,
"Scroggins"
,
"Scuddy"
,
"Seabeck"
,
"Seabrook"
,
"Seacliff"
,
"Seadrift"
,
"Seaford"
,
"Seaforth"
,
"Seagirt"
,
"Seagoville"
,
"Seahurst"
,
"Seale"
,
"Sealston"
,
"Sealy"
,
"Seanor"
,
"Searcy"
,
"Searles"
,
"Searsboro"
,
"Searsmont"
,
"Searsport"
,
"Seaton"
,
"Seatonville"
,
"Seaview"
,
"Sebastopol"
,
"Sebec"
,
"Sebeka"
,
"Sebewaing"
,
"Seboeis"
,
"Seboyeta"
,
"Sebree"
,
"Sebring"
,
"Secaucus"
,
"Seco"
,
"Secor"
,
"Sedalia"
,
"Sedgwick"
,
"Sedley"
,
"Sedona"
,
"Seekonk"
,
"Seeley"
,
"Seelyville"
,
"Seffner"
,
"Seguin"
,
"Seibert"
,
"Seiling"
,
"Seitz"
,
"Sekiu"
,
"Selah"
,
"Selby"
,
"Selbyville"
,
"Selden"
,
"Seligman"
,
"Sellers"
,
"Sellersburg"
,
"Sellersville"
,
"Sells"
,
"Selmer"
,
"Selz"
,
"Semmes"
,
"Semora"
,
"Sena"
,
"Senath"
,
"Senatobia"
,
"Senecaville"
,
"Seney"
,
"Sennett"
,
"Senoia"
,
"Sepulveda"
,
"Sequatchie"
,
"Sequim"
,
"Serafina"
,
"Seree"
,
"Serena"
,
"Servia"
,
"Sesser"
,
"Sevenmile"
,
"Severance"
,
"Severy"
,
"Sevierville"
,
"Sewanee"
,
"Sewaren"
,
"Sewell"
,
"Sewickley"
,
"Sextonville"
,
"Shabbona"
,
"Shacklefords"
,
"Shadydale"
,
"Shadyside"
,
"Shafter"
,
"Shaftsburg"
,
"Shaftsbury"
,
"Shakopee"
,
"Shalimar"
,
"Shallotte"
,
"Shallowater"
,
"Shambaugh"
,
"Shamokin"
,
"Shandaken"
,
"Shandon"
,
"Shaniko"
,
"Shanks"
,
"Shanksville"
,
"Shannock"
,
"Shapleigh"
,
"Sharpes"
,
"Sharples"
,
"Sharps"
,
"Sharpsburg"
,
"Sharpsville"
,
"Sharptown"
,
"Shartlesville"
,
"Shattuc"
,
"Shattuckville"
,
"Shauck"
,
"Shawanee"
,
"Shawanese"
,
"Shawano"
,
"Shawboro"
,
"Shawmut"
,
"Shawneetown"
,
"Shawsville"
,
"Shawville"
,
"Sheakleyville"
,
"Sheboygan"
,
"Shedd"
,
"Sheds"
,
"Shelbiana"
,
"Shelbina"
,
"Shelburn"
,
"Shelburne"
,
"Shelbyville"
,
"Sheldahl"
,
"Sheldonville"
,
"Shellman"
,
"Shellsburg"
,
"Shelly"
,
"Shelocta"
,
"Shepardsville"
,
"Shepherdstown"
,
"Sheppton"
,
"Sherard"
,
"Sherborn"
,
"Sherburn"
,
"Sherburne"
,
"Sherrard"
,
"Sherrodsville"
,
"Shevlin"
,
"Sheyenne"
,
"Shickley"
,
"Shickshinny"
,
"Shidler"
,
"Shiner"
,
"Shingleton"
,
"Shingletown"
,
"Shinhopple"
,
"Shinnston"
,
"Shiocton"
,
"Shippensburg"
,
"Shippenville"
,
"Shipshewana"
,
"Shirland"
,
"Shirleysburg"
,
"Shiro"
,
"Shoals"
,
"Shobonier"
,
"Shohola"
,
"Shokan"
,
"Shongaloo"
,
"Shopville"
,
"Shoreham"
,
"Shorter"
,
"Shorterville"
,
"Shortsville"
,
"Shoshone"
,
"Shoshoni"
,
"Showell"
,
"Showlow"
,
"Shreve"
,
"Shrewsbury"
,
"Shubert"
,
"Shubuta"
,
"Shulerville"
,
"Shullsburg"
,
"Shumway"
,
"Shunk"
,
"Shuqualak"
,
"Shushan"
,
"Shutesbury"
,
"Sias"
,
"Sicklerville"
,
"Sidell"
,
"Sidman"
,
"Sidnaw"
,
"Sidon"
,
"Sieper"
,
"Sierraville"
,
"Sigel"
,
"Sigourney"
,
"Sigurd"
,
"Sikes"
,
"Sikeston"
,
"Siler"
,
"Silerton"
,
"Siletz"
,
"Silex"
,
"Siloam"
,
"Silsbee"
,
"Siluria"
,
"Silva"
,
"Silvana"
,
"Silverado"
,
"Silvercliff"
,
"Silverdale"
,
"Silverpeak"
,
"Silverplume"
,
"Silverstar"
,
"Silverstreet"
,
"Silverton"
,
"Silverwood"
,
"Silvis"
,
"Simla"
,
"Simmesport"
,
"Simms"
,
"Simonton"
,
"Simpsonville"
,
"Simsboro"
,
"Simsbury"
,
"Sinclairville"
,
"Singer"
,
"Sinnamahoning"
,
"Sinsinawa"
,
"Sinton"
,
"Sipesville"
,
"Sipsey"
,
"Sisseton"
,
"Sisters"
,
"Sistersville"
,
"Sitka"
,
"Sixes"
,
"Sixmile"
,
"Skamokawa"
,
"Skandia"
,
"Skanee"
,
"Skellytown"
,
"Skelton"
,
"Skene"
,
"Skiatook"
,
"Skidmore"
,
"Skillman"
,
"Skippack"
,
"Skippers"
,
"Skipperville"
,
"Skipwith"
,
"Skokie"
,
"Skowhegan"
,
"Skykomish"
,
"Skyland"
,
"Slade"
,
"Slagle"
,
"Slanesville"
,
"Slatedale"
,
"Slatersville"
,
"Slatington"
,
"Slaton"
,
"Slaughters"
,
"Slayden"
,
"Slayton"
,
"Sleepyeye"
,
"Slemp"
,
"Slickville"
,
"Slidell"
,
"Sligo"
,
"Slinger"
,
"Sloansville"
,
"Sloatsburg"
,
"Slocomb"
,
"Sloughhouse"
,
"Slovan"
,
"Smackover"
,
"Smallwood"
,
"Smarr"
,
"Smartt"
,
"Smartville"
,
"Smelterville"
,
"Smethport"
,
"Smicksburg"
,
"Smilax"
,
"Smiley"
,
"Smithboro"
,
"Smithburg"
,
"Smithdale"
,
"Smithers"
,
"Smithland"
,
"Smiths"
,
"Smithsburg"
,
"Smithshire"
,
"Smithton"
,
"Smithtown"
,
"Smithville"
,
"Smithwick"
,
"Smoaks"
,
"Smock"
,
"Smoketown"
,
"Smolan"
,
"Smoot"
,
"Smyer"
,
"Sneads"
,
"Sneedville"
,
"Snelling"
,
"Snellville"
,
"Snohomish"
,
"Snoqualmie"
,
"Snover"
,
"Snowmass"
,
"Snowville"
,
"Snydersburg"
,
"Socorro"
,
"Soddy"
,
"Sodus"
,
"Solano"
,
"Solebury"
,
"Soledad"
,
"Solen"
,
"Solgohachia"
,
"Solomons"
,
"Solsberry"
,
"Solsville"
,
"Solvang"
,
"Solway"
,
"Somerdale"
,
"Somersville"
,
"Somersworth"
,
"Somerton"
,
"Somis"
,
"Somonauk"
,
"Sondheimer"
,
"Sonoita"
,
"Sontag"
,
"Sonyea"
,
"Sopchoppy"
,
"Soper"
,
"Soperton"
,
"Soquel"
,
"Sorento"
,
"Sorrento"
,
"Soso"
,
"Soudan"
,
"Souder"
,
"Soudersburg"
,
"Souderton"
,
"Soulsbyville"
,
"Souris"
,
"Spanaway"
,
"Spangler"
,
"Spanishburg"
,
"Sparkill"
,
"Sparks"
,
"Sparland"
,
"Sparr"
,
"Sparrowbush"
,
"Spartanburg"
,
"Spartansburg"
,
"Spavinaw"
,
"Speaks"
,
"Spearfish"
,
"Spearman"
,
"Spearsville"
,
"Spearville"
,
"Speculator"
,
"Speer"
,
"Speight"
,
"Spelter"
,
"Spencerport"
,
"Spencertown"
,
"Spencerville"
,
"Speonk"
,
"Sperryville"
,
"Spiceland"
,
"Spicer"
,
"Spicewood"
,
"Spickard"
,
"Spillville"
,
"Spindale"
,
"Spinnerstown"
,
"Spiritwood"
,
"Spivey"
,
"Splendora"
,
"Spofford"
,
"Spooner"
,
"Spotswood"
,
"Spotsylvania"
,
"Spottsville"
,
"Spottswood"
,
"Spraggs"
,
"Spragueville"
,
"Sprakers"
,
"Sprigg"
,
"Springboro"
,
"Springbrook"
,
"Springdale"
,
"Springer"
,
"Springerton"
,
"Springerville"
,
"Springhope"
,
"Springhouse"
,
"Springlick"
,
"Springport"
,
"Springs"
,
"Springtown"
,
"Springvale"
,
"Springville"
,
"Springwater"
,
"Sprott"
,
"Spurgeon"
,
"Spurger"
,
"Spurlock"
,
"Spurlockville"
,
"Squires"
,
"Staatsburg"
,
"Stacyville"
,
"Staffordville"
,
"Stahlstown"
,
"Stambaugh"
,
"Stamps"
,
"Stanaford"
,
"Stanardsville"
,
"Stanberry"
,
"Stanchfield"
,
"Stanfield"
,
"Stanfordville"
,
"Stanleytown"
,
"Stantonsburg"
,
"Stantonville"
,
"Stanville"
,
"Stanwood"
,
"Staplehurst"
,
"Staples"
,
"Starbuck"
,
"Starford"
,
"Starke"
,
"Starks"
,
"Starksboro"
,
"Starkville"
,
"Starkweather"
,
"Starrucca"
,
"Startex"
,
"Statenville"
,
"Statesboro"
,
"Statesville"
,
"Statham"
,
"Stayton"
,
"Steamburg"
,
"Stedman"
,
"Steedman"
,
"Steeleville"
,
"Steelville"
,
"Steens"
,
"Steff"
,
"Steffenville"
,
"Steger"
,
"Stehekin"
,
"Steinauer"
,
"Steinhatchee"
,
"Stendal"
,
"Stephan"
,
"Stephensburg"
,
"Stephentown"
,
"Stephenville"
,
"Steptoe"
,
"Sterlington"
,
"Sterrett"
,
"Stetsonville"
,
"Steubenville"
,
"Stevensburg"
,
"Stevensville"
,
"Stevinson"
,
"Stewardson"
,
"Stewartstown"
,
"Stewartsville"
,
"Stewartville"
,
"Sthelena"
,
"Stickney"
,
"Stidham"
,
"Stigler"
,
"Stilesville"
,
"Stillmore"
,
"Stillwell"
,
"Stilwell"
,
"Stinesville"
,
"Stinnett"
,
"Stirrat"
,
"Stites"
,
"Stittville"
,
"Stitzer"
,
"Stockdale"
,
"Stockertown"
,
"Stockett"
,
"Stockland"
,
"Stockport"
,
"Stockville"
,
"Stockwell"
,
"Stoddard"
,
"Stokesdale"
,
"Stollings"
,
"Stoneboro"
,
"Stonefort"
,
"Stonega"
,
"Stoneham"
,
"Stoneville"
,
"Stonington"
,
"Stonybottom"
,
"Stonybrook"
,
"Stonyford"
,
"Storden"
,
"Stormville"
,
"Storrie"
,
"Storrs"
,
"Stottville"
,
"Stoughton"
,
"Stoutland"
,
"Stoutsville"
,
"Stovall"
,
"Stover"
,
"Stowe"
,
"Stowell"
,
"Stoy"
,
"Stoystown"
,
"Strabane"
,
"Strafford"
,
"Strandburg"
,
"Strandquist"
,
"Strang"
,
"Strasburg"
,
"Stratham"
,
"Strathcona"
,
"Strathmere"
,
"Strathmore"
,
"Strattanville"
,
"Straughn"
,
"Strausstown"
,
"Strawn"
,
"Streamwood"
,
"Streator"
,
"Streeter"
,
"Streetman"
,
"Streetsboro"
,
"Stringer"
,
"Stringtown"
,
"Stroh"
,
"Stromsburg"
,
"Stronghurst"
,
"Stroud"
,
"Stroudsburg"
,
"Strunk"
,
"Struthers"
,
"Stryker"
,
"Strykersville"
,
"Studley"
,
"Stumptown"
,
"Sturdivant"
,
"Sturgis"
,
"Sturkie"
,
"Sturtevant"
,
"Suamico"
,
"Subiaco"
,
"Sublette"
,
"Sublime"
,
"Sublimity"
,
"Succasunna"
,
"Suches"
,
"Sudbury"
,
"Sudith"
,
"Sudlersville"
,
"Suffern"
,
"Suffield"
,
"Sugarland"
,
"Sugarloaf"
,
"Sugartown"
,
"Sugartree"
,
"Sula"
,
"Sulligent"
,
"Sultana"
,
"Sumas"
,
"Sumerco"
,
"Sumerduck"
,
"Sumiton"
,
"Summerdale"
,
"Summerfield"
,
"Summerland"
,
"Summerlee"
,
"Summershade"
,
"Summersville"
,
"Summerton"
,
"Summertown"
,
"Summerville"
,
"Summit"
,
"Summitville"
,
"Sumneytown"
,
"Sumpter"
,
"Sumrall"
,
"Sumterville"
,
"Sunapee"
,
"Sunbright"
,
"Sunburg"
,
"Sunburst"
,
"Sunbury"
,
"Suncook"
,
"Sundance"
,
"Sunderland"
,
"Sunfield"
,
"Sunland"
,
"Sunman"
,
"Sunnyside"
,
"Sunnysouth"
,
"Sunol"
,
"Sunray"
,
"Supai"
,
"Suplee"
,
"Suquamish"
,
"Surgoinsville"
,
"Suring"
,
"Surrency"
,
"Surry"
,
"Susank"
,
"Susanville"
,
"Susquehanna"
,
"Sutersville"
,
"Sutherlin"
,
"Sutter"
,
"Suwanee"
,
"Suwannee"
,
"Svea"
,
"Swainsboro"
,
"Swaledale"
,
"Swampscott"
,
"Swannanoa"
,
"Swansboro"
,
"Swansea"
,
"Swanton"
,
"Swanville"
,
"Swanwick"
,
"Swartswood"
,
"Swartz"
,
"Swayzee"
,
"Swedeborg"
,
"Swedesboro"
,
"Swedesburg"
,
"Sweeden"
,
"Sweeny"
,
"Sweetbriar"
,
"Sweetgrass"
,
"Sweetland"
,
"Sweetser"
,
"Sweetwater"
,
"Swengel"
,
"Swepsonville"
,
"Swifton"
,
"Swiftown"
,
"Swiftwater"
,
"Swink"
,
"Swisher"
,
"Switchback"
,
"Swoope"
,
"Sybertsville"
,
"Sykeston"
,
"Sykesville"
,
"Sylacauga"
,
"Sylmar"
,
"Sylva"
,
"Symsonia"
,
"Syosset"
,
"Taberg"
,
"Tabernash"
,
"Tabiona"
,
"Tabor"
,
"Tacna"
,
"Tacoma"
,
"Taconic"
,
"Taconite"
,
"Tafton"
,
"Taftsville"
,
"Taftville"
,
"Tahlequah"
,
"Tahoka"
,
"Taholah"
,
"Tahuya"
,
"Taiban"
,
"Taintor"
,
"Talala"
,
"Talbert"
,
"Talbot"
,
"Talbott"
,
"Talbotton"
,
"Talco"
,
"Talcott"
,
"Talihina"
,
"Talisheek"
,
"Talladega"
,
"Tallapoosa"
,
"Tallassee"
,
"Tallega"
,
"Tallevast"
,
"Tallmadge"
,
"Tallman"
,
"Tallmansville"
,
"Tallula"
,
"Tallulah"
,
"Talmage"
,
"Talmo"
,
"Taloga"
,
"Talpa"
,
"Tama"
,
"Tamaqua"
,
"Tamaroa"
,
"Tamassee"
,
"Tamiment"
,
"Tamms"
,
"Tampico"
,
"Tams"
,
"Tamworth"
,
"Taneytown"
,
"Taneyville"
,
"Tangier"
,
"Tangipahoa"
,
"Tanner"
,
"Tannersville"
,
"Taopi"
,
"Taplin"
,
"Tapoco"
,
"Tappahannock"
,
"Tappan"
,
"Tappen"
,
"Tarboro"
,
"Tarentum"
,
"Tarheel"
,
"Tariffville"
,
"Tarkio"
,
"Tarpley"
,
"Tarrs"
,
"Tarzana"
,
"Tasley"
,
"Taswell"
,
"Tatamy"
,
"Tateville"
,
"Tatum"
,
"Tatums"
,
"Taunton"
,
"Tavares"
,
"Tavernier"
,
"Taylors"
,
"Taylorstown"
,
"Taylorsville"
,
"Taylorville"
,
"Tazewell"
,
"Tchula"
,
"Teaberry"
,
"Teachey"
,
"Teague"
,
"Teaneck"
,
"Teasdale"
,
"Teays"
,
"Tebbetts"
,
"Tecate"
,
"Techny"
,
"Tecopa"
,
"Tecumseh"
,
"Tefft"
,
"Tehachapi"
,
"Tehama"
,
"Tehuacana"
,
"Tekamah"
,
"Tekoa"
,
"Tekonsha"
,
"Telferner"
,
"Telford"
,
"Telluride"
,
"Telogia"
,
"Temecula"
,
"Tempe"
,
"Templeville"
,
"Tenafly"
,
"Tenaha"
,
"Tendoy"
,
"Tenino"
,
"Tenmile"
,
"Tennant"
,
"Tennent"
,
"Tennga"
,
"Tennille"
,
"Tensed"
,
"Tenstrike"
,
"Tererro"
,
"Teresita"
,
"Terlingua"
,
"Terlton"
,
"Termo"
,
"Terraalta"
,
"Terraceia"
,
"Terral"
,
"Terrebonne"
,
"Terrell"
,
"Terreton"
,
"Terril"
,
"Terryville"
,
"Tescott"
,
"Tesla"
,
"Tesuque"
,
"Teton"
,
"Tetonia"
,
"Teutopolis"
,
"Tewksbury"
,
"Texarkana"
,
"Texhoma"
,
"Texico"
,
"Texline"
,
"Texola"
,
"Texon"
,
"Thacker"
,
"Thackerville"
,
"Thatcher"
,
"Thawville"
,
"Thaxton"
,
"Thayne"
,
"Thedford"
,
"Theilman"
,
"Thendara"
,
"Theodosia"
,
"Theriot"
,
"Thermopolis"
,
"Therock"
,
"Thetford"
,
"Thibodaux"
,
"Thida"
,
"Thiells"
,
"Thiensville"
,
"Thomasboro"
,
"Thomaston"
,
"Thomastown"
,
"Thomasville"
,
"Thompsons"
,
"Thompsontown"
,
"Thompsonville"
,
"Thonotosassa"
,
"Thornburg"
,
"Thorndale"
,
"Thorndike"
,
"Thornfield"
,
"Thorntown"
,
"Thornville"
,
"Thornwood"
,
"Thorp"
,
"Thorsby"
,
"Throckmorton"
,
"Thurmond"
,
"Thurmont"
,
"Thurston"
,
"Tibbie"
,
"Tiburon"
,
"Tichnor"
,
"Tickfaw"
,
"Ticonderoga"
,
"Tidioute"
,
"Tiesiding"
,
"Tieton"
,
"Tiff"
,
"Tiffin"
,
"Tifton"
,
"Tigerton"
,
"Tigerville"
,
"Tignall"
,
"Tigrett"
,
"Tijeras"
,
"Tilden"
,
"Tilghman"
,
"Tiline"
,
"Tillamook"
,
"Tillar"
,
"Tillatoba"
,
"Tilleda"
,
"Tiller"
,
"Tillery"
,
"Tillman"
,
"Tillson"
,
"Tilly"
,
"Tilton"
,
"Tiltonsville"
,
"Timberville"
,
"Timblin"
,
"Timbo"
,
"Timewell"
,
"Timken"
,
"Timmonsville"
,
"Timnath"
,
"Timonium"
,
"Timpson"
,
"Tingley"
,
"Tinnie"
,
"Tinsley"
,
"Tintah"
,
"Tiona"
,
"Tionesta"
,
"Tiplersville"
,
"Tippecanoe"
,
"Tippo"
,
"Tipton"
,
"Tiptonville"
,
"Tiro"
,
"Tishomingo"
,
"Tiskilwa"
,
"Titonka"
,
"Titusville"
,
"Tiverton"
,
"Tivoli"
,
"Toaalta"
,
"Toabaja"
,
"Toano"
,
"Tobaccoville"
,
"Tobias"
,
"Tobinsport"
,
"Tobyhanna"
,
"Toccoa"
,
"Toccopola"
,
"Tocsin"
,
"Toddville"
,
"Tofte"
,
"Tohatchi"
,
"Toivola"
,
"Tokeland"
,
"Tokio"
,
"Tolar"
,
"Toler"
,
"Tolland"
,
"Tollesboro"
,
"Tolleson"
,
"Tolley"
,
"Tolna"
,
"Tolono"
,
"Tolu"
,
"Toluca"
,
"Tomah"
,
"Tomahawk"
,
"Tomales"
,
"Tomball"
,
"Tombean"
,
"Tompkinsville"
,
"Tomsbrook"
,
"Tonalea"
,
"Tonasket"
,
"Tonawanda"
,
"Toney"
,
"Tonganoxie"
,
"Tonica"
,
"Tonkawa"
,
"Tonopah"
,
"Tontitown"
,
"Tontobasin"
,
"Tontogany"
,
"Tooele"
,
"Toomsboro"
,
"Toomsuba"
,
"Toone"
,
"Topanga"
,
"Topawa"
,
"Topinabee"
,
"Topock"
,
"Toponas"
,
"Toppenish"
,
"Topping"
,
"Topsfield"
,
"Topsham"
,
"Topton"
,
"Toquerville"
,
"Torbert"
,
"Tornillo"
,
"Torreon"
,
"Torrey"
,
"Torrington"
,
"Toston"
,
"Totowa"
,
"Totz"
,
"Touchet"
,
"Tougaloo"
,
"Toughkenamon"
,
"Toulon"
,
"Toutle"
,
"Tovey"
,
"Towaco"
,
"Towanda"
,
"Towaoc"
,
"Towner"
,
"Townley"
,
"Townshend"
,
"Townsville"
,
"Townville"
,
"Toxey"
,
"Toyah"
,
"Toyahvale"
,
"Tracyton"
,
"Traer"
,
"Trafalgar"
,
"Trafford"
,
"Trampas"
,
"Tranquility"
,
"Trappe"
,
"Traskwood"
,
"Traunik"
,
"Traver"
,
"Treadway"
,
"Treadwell"
,
"Trebloc"
,
"Treece"
,
"Trego"
,
"Treichlers"
,
"Treloar"
,
"Trementina"
,
"Tremont"
,
"Tremonton"
,
"Trempealeau"
,
"Trenary"
,
"Trent"
,
"Tresckow"
,
"Trespiedras"
,
"Trespinos"
,
"Trevett"
,
"Trevor"
,
"Trevorton"
,
"Trexlertown"
,
"Treynor"
,
"Trezevant"
,
"Triadelphia"
,
"Tribbett"
,
"Tridell"
,
"Trilby"
,
"Trilla"
,
"Trimble"
,
"Trimont"
,
"Trinchera"
,
"Trinway"
,
"Trion"
,
"Tripp"
,
"Trivoli"
,
"Trona"
,
"Trosky"
,
"Trosper"
,
"Trotters"
,
"Troup"
,
"Troupsburg"
,
"Troutdale"
,
"Troutville"
,
"Troxelville"
,
"Truckee"
,
"Truesdale"
,
"Trufant"
,
"Truk"
,
"Trumann"
,
"Trumansburg"
,
"Truro"
,
"Truscott"
,
"Trussville"
,
"Truxton"
,
"Tryon"
,
"Tualatin"
,
"Tubac"
,
"Tuckahoe"
,
"Tuckasegee"
,
"Tuckerman"
,
"Tuckerton"
,
"Tucumcari"
,
"Tujunga"
,
"Tula"
,
"Tulare"
,
"Tularosa"
,
"Tuleta"
,
"Tulia"
,
"Tullahassee"
,
"Tullahoma"
,
"Tullos"
,
"Tully"
,
"Tumacacori"
,
"Tunas"
,
"Tunica"
,
"Tunkhannock"
,
"Tunnelton"
,
"Tuolumne"
,
"Tupman"
,
"Turbeville"
,
"Turbotville"
,
"Turlock"
,
"Turner"
,
"Turners"
,
"Turnersburg"
,
"Turnersville"
,
"Turnerville"
,
"Turney"
,
"Turon"
,
"Turpin"
,
"Turrell"
,
"Turtletown"
,
"Turton"
,
"Tuscarawas"
,
"Tuscola"
,
"Tuscumbia"
,
"Tuskahoma"
,
"Tussy"
,
"Tustin"
,
"Tutorkey"
,
"Tutwiler"
,
"Twinbrooks"
,
"Twining"
,
"Twinoaks"
,
"Twinsburg"
,
"Twisp"
,
"Tyaskin"
,
"Tye"
,
"Tylersburg"
,
"Tylersport"
,
"Tylersville"
,
"Tylerton"
,
"Tylertown"
,
"Tynan"
,
"Tyner"
,
"Tyngsboro"
,
"Tyro"
,
"Tyrone"
,
"Tyronza"
,
"Tyty"
,
"Ubly"
,
"Ucon"
,
"Udall"
,
"Udell"
,
"Uehling"
,
"Uhrichsville"
,
"Ukiah"
,
"Uledi"
,
"Ulen"
,
"Ullin"
,
"Ulm"
,
"Ulman"
,
"Ulmer"
,
"Umatilla"
,
"Umbarger"
,
"Umpqua"
,
"Una"
,
"Unadilla"
,
"Uncasville"
,
"Underwood"
,
"Uneeda"
,
"Unicoi"
,
"Uniondale"
,
"Unionhall"
,
"Unionport"
,
"Uniontown"
,
"Unionville"
,
"Uniopolis"
,
"United"
,
"Unityhouse"
,
"Unityville"
,
"University"
,
"Upham"
,
"Upperco"
,
"Upperville"
,
"Upsala"
,
"Upson"
,
"Uravan"
,
"Urbanna"
,
"Uriah"
,
"Urich"
,
"Ursina"
,
"Ute"
,
"Utuado"
,
"Uvalda"
,
"Uvalde"
,
"Uwchland"
,
"Vacaville"
,
"Vacherie"
,
"Vada"
,
"Vader"
,
"Vadis"
,
"Vadito"
,
"Vaiden"
,
"Valatie"
,
"Valders"
,
"Valdese"
,
"Valdez"
,
"Valdosta"
,
"Valencia"
,
"Valentines"
,
"Valera"
,
"Valier"
,
"Vallecito"
,
"Vallecitos"
,
"Vallejo"
,
"Valliant"
,
"Vallonia"
,
"Valmeyer"
,
"Valmy"
,
"Valona"
,
"Valrico"
,
"Valyermo"
,
"Vanalstyne"
,
"Vanceboro"
,
"Vanceburg"
,
"Vancourt"
,
"Vandalia"
,
"Vandemere"
,
"Vandergrift"
,
"Vanderpool"
,
"Vandervoort"
,
"Vandiver"
,
"Vanduser"
,
"Vandyne"
,
"Vanetten"
,
"Vanhorn"
,
"Vanna"
,
"Vanndale"
,
"Vannuys"
,
"Vanorin"
,
"Vansant"
,
"Vantassell"
,
"Vanvleck"
,
"Vanwert"
,
"Vanwyck"
,
"Vanzant"
,
"Vardaman"
,
"Varina"
,
"Varna"
,
"Varnell"
,
"Varney"
,
"Varnville"
,
"Varysburg"
,
"Vashon"
,
"Vass"
,
"Vassalboro"
,
"Vaucluse"
,
"Vaughnsville"
,
"Vauxhall"
,
"Veblen"
,
"Veedersburg"
,
"Vegabaja"
,
"Veguita"
,
"Velarde"
,
"Velma"
,
"Velpen"
,
"Velva"
,
"Venango"
,
"Venedocia"
,
"Venedy"
,
"Veneta"
,
"Venetia"
,
"Ventress"
,
"Ventura"
,
"Venturia"
,
"Veradale"
,
"Verbank"
,
"Verda"
,
"Verdel"
,
"Verden"
,
"Verdigre"
,
"Verdon"
,
"Verdunville"
,
"Vergas"
,
"Vergennes"
,
"Veribest"
,
"Vermillion"
,
"Vermontville"
,
"Verndale"
,
"Verner"
,
"Vernon"
,
"Vernonia"
,
"Verplanck"
,
"Vershire"
,
"Vertrees"
,
"Vesta"
,
"Vestaburg"
,
"Vesuvius"
,
"Vevay"
,
"Vian"
,
"Viborg"
,
"Vicco"
,
"Vici"
,
"Vick"
,
"Vickery"
,
"Victorville"
,
"Vidalia"
,
"Vidor"
,
"Vieques"
,
"Viewtown"
,
"Vilas"
,
"Villalba"
,
"Villamaria"
,
"Villamont"
,
"Villanova"
,
"Villanueva"
,
"Villard"
,
"Villarica"
,
"Villas"
,
"Villisca"
,
"Vilonia"
,
"Vina"
,
"Vincennes"
,
"Vincentown"
,
"Vineburg"
,
"Vineland"
,
"Vinemont"
,
"Vining"
,
"Vinita"
,
"Vinton"
,
"Vintondale"
,
"Viper"
,
"Virden"
,
"Virgie"
,
"Virgilina"
,
"Virginville"
,
"Viroqua"
,
"Visalia"
,
"Vliets"
,
"Voca"
,
"Volant"
,
"Volborg"
,
"Volga"
,
"Volin"
,
"Volney"
,
"Voluntown"
,
"Vona"
,
"Vonore"
,
"Vonormy"
,
"Voorheesville"
,
"Vossburg"
,
"Votaw"
,
"Vowinckel"
,
"Vredenburgh"
,
"Waban"
,
"Wabasha"
,
"Wabasso"
,
"Wabbaseka"
,
"Wabeno"
,
"Waccabuc"
,
"Wachapreague"
,
"Wacissa"
,
"Waconia"
,
"Waddell"
,
"Waddington"
,
"Waddy"
,
"Wadena"
,
"Wadesboro"
,
"Wadestown"
,
"Wadesville"
,
"Wadhams"
,
"Wadley"
,
"Waelder"
,
"Wagarville"
,
"Wagener"
,
"Waggoner"
,
"Wagoner"
,
"Wagontown"
,
"Wagram"
,
"Wahiawa"
,
"Wahkiacus"
,
"Wahkon"
,
"Wahoo"
,
"Wahpeton"
,
"Waialua"
,
"Waianae"
,
"Wailuku"
,
"Waimanalo"
,
"Waimea"
,
"Wainscott"
,
"Waipahu"
,
"Waiteville"
,
"Waitsburg"
,
"Waitsfield"
,
"Waka"
,
"Wakarusa"
,
"Wakeeney"
,
"Wakeman"
,
"Wakenda"
,
"Wakita"
,
"Wakonda"
,
"Wakpala"
,
"Wakulla"
,
"Walburg"
,
"Waldenburg"
,
"Waldoboro"
,
"Waldport"
,
"Waldwick"
,
"Wales"
,
"Waleska"
,
"Walford"
,
"Walhalla"
,
"Walhonding"
,
"Walker"
,
"Walkersville"
,
"Walkerton"
,
"Walkertown"
,
"Walkerville"
,
"Wallaceton"
,
"Walland"
,
"Wallback"
,
"Wallburg"
,
"Walling"
,
"Wallingford"
,
"Wallisville"
,
"Wallkill"
,
"Wallowa"
,
"Wallsburg"
,
"Wallula"
,
"Walnutshade"
,
"Walsenburg"
,
"Walshville"
,
"Walston"
,
"Walstonburg"
,
"Walterboro"
,
"Waltersburg"
,
"Walterville"
,
"Walthall"
,
"Walthourville"
,
"Waltonville"
,
"Walworth"
,
"Wamego"
,
"Wampsville"
,
"Wampum"
,
"Wamsutter"
,
"Wana"
,
"Wanakena"
,
"Wanamingo"
,
"Wanaque"
,
"Wanatah"
,
"Wanblee"
,
"Wanchese"
,
"Wanda"
,
"Wando"
,
"Waneta"
,
"Wanette"
,
"Wann"
,
"Wannaska"
,
"Wantagh"
,
"Wapakoneta"
,
"Wapanucka"
,
"Wapella"
,
"Wapello"
,
"Wappapello"
,
"Wapwallopen"
,
"Warba"
,
"Warda"
,
"Wardell"
,
"Wardensville"
,
"Wardsboro"
,
"Wardtown"
,
"Wardville"
,
"Wareham"
,
"Waresboro"
,
"Wareshoals"
,
"Waretown"
,
"Warfield"
,
"Warfordsburg"
,
"Warminster"
,
"Warne"
,
"Warner"
,
"Warners"
,
"Warnerville"
,
"Warnock"
,
"Warrendale"
,
"Warrens"
,
"Warrensburg"
,
"Warrensville"
,
"Warrenton"
,
"Warrenville"
,
"Warrington"
,
"Wartburg"
,
"Warthen"
,
"Wartrace"
,
"Wasco"
,
"Wascott"
,
"Waseca"
,
"Washita"
,
"Washougal"
,
"Washta"
,
"Washtucna"
,
"Waskish"
,
"Waskom"
,
"Wasola"
,
"Wassaic"
,
"Wasta"
,
"Wataga"
,
"Watauga"
,
"Waterboro"
,
"Waterflow"
,
"Waterford"
,
"Waterport"
,
"Watersmeet"
,
"Waterview"
,
"Waterville"
,
"Watervliet"
,
"Watha"
,
"Wathena"
,
"Watkinsville"
,
"Watonga"
,
"Watrous"
,
"Watseka"
,
"Watsontown"
,
"Watsonville"
,
"Watton"
,
"Wattsburg"
,
"Wattsville"
,
"Waubun"
,
"Wauchula"
,
"Waucoma"
,
"Wauconda"
,
"Waukau"
,
"Waukee"
,
"Waukegan"
,
"Waukesha"
,
"Waukomis"
,
"Waukon"
,
"Wauna"
,
"Waunakee"
,
"Wauneta"
,
"Waupaca"
,
"Waupun"
,
"Wauregan"
,
"Waurika"
,
"Wausa"
,
"Wausau"
,
"Wausaukee"
,
"Wauseon"
,
"Wautoma"
,
"Wauzeka"
,
"Waveland"
,
"Waverley"
,
"Waverly"
,
"Waves"
,
"Wawaka"
,
"Wawarsing"
,
"Wawina"
,
"Waxahachie"
,
"Waxhaw"
,
"Wayan"
,
"Waycross"
,
"Wayland"
,
"Waymart"
,
"Waynesboro"
,
"Waynesburg"
,
"Waynesfield"
,
"Waynesville"
,
"Waynetown"
,
"Waynoka"
,
"Wayzata"
,
"Weare"
,
"Weatherby"
,
"Weatherford"
,
"Weatherly"
,
"Weatogue"
,
"Weaubleau"
,
"Weaver"
,
"Weaverville"
,
"Webber"
,
"Webberville"
,
"Webbville"
,
"Websterville"
,
"Wedderburn"
,
"Wedgefield"
,
"Wedowee"
,
"Wedron"
,
"Weedsport"
,
"Weedville"
,
"Weeksbury"
,
"Weems"
,
"Weepingwater"
,
"Weesatche"
,
"Weidman"
,
"Weikert"
,
"Weimar"
,
"Weiner"
,
"Weinert"
,
"Weippe"
,
"Weirsdale"
,
"Weirton"
,
"Weirwood"
,
"Weiser"
,
"Weissert"
,
"Welaka"
,
"Welches"
,
"Welda"
,
"Weldona"
,
"Weleetka"
,
"Wellborn"
,
"Wellford"
,
"Welling"
,
"Wellman"
,
"Wellpinit"
,
"Wellsboro"
,
"Wellsburg"
,
"Wellston"
,
"Wellsville"
,
"Wellton"
,
"Welton"
,
"Welty"
,
"Wenatchee"
,
"Wendel"
,
"Wenden"
,
"Wendover"
,
"Wenham"
,
"Wenona"
,
"Wenonah"
,
"Wentworth"
,
"Wentzville"
,
"Weogufka"
,
"Weott"
,
"Wernersville"
,
"Wesco"
,
"Weskan"
,
"Weslaco"
,
"Wessington"
,
"Wesson"
,
"Westby"
,
"Wethersfield"
,
"Wetmore"
,
"Wetumka"
,
"Wetumpka"
,
"Wever"
,
"Wevertown"
,
"Wewahitchka"
,
"Wewela"
,
"Wewoka"
,
"Wexford"
,
"Weyanoke"
,
"Weyauwega"
,
"Weyerhaeuser"
,
"Weymouth"
,
"Whalan"
,
"Whaleysville"
,
"Whallonsburg"
,
"Wharncliffe"
,
"Whately"
,
"Wheatcroft"
,
"Wheatfield"
,
"Wheatland"
,
"Wheatley"
,
"Wheaton"
,
"Wheeler"
,
"Wheelersburg"
,
"Wheeling"
,
"Wheelock"
,
"Wheelwright"
,
"Whick"
,
"Whigham"
,
"Whipholt"
,
"Whippleville"
,
"Whiskeytown"
,
"Whitakers"
,
"Whitby"
,
"Whitebird"
,
"Whiteclay"
,
"Whitefield"
,
"Whitefish"
,
"Whiteford"
,
"Whiteheath"
,
"Whitehouse"
,
"Whiteland"
,
"Whitelaw"
,
"Whiteowl"
,
"Whitepost"
,
"Whitesboro"
,
"Whitesburg"
,
"Whiteside"
,
"Whitestone"
,
"Whitestown"
,
"Whitesville"
,
"Whitethorn"
,
"Whiteville"
,
"Whitewater"
,
"Whitewood"
,
"Whitewright"
,
"Whitfield"
,
"Whitharral"
,
"Whiting"
,
"Whitingham"
,
"Whitinsville"
,
"Whitlash"
,
"Whitleyville"
,
"Whitmer"
,
"Whitmire"
,
"Whitmore"
,
"Whitneyville"
,
"Whitsett"
,
"Whitt"
,
"Whittemore"
,
"Whitten"
,
"Whittington"
,
"Whitwell"
,
"Whon"
,
"Wibaux"
,
"Wiborg"
,
"Wickatunk"
,
"Wickenburg"
,
"Wickes"
,
"Wickett"
,
"Wickliffe"
,
"Wicomico"
,
"Wiconisco"
,
"Wideman"
,
"Widener"
,
"Widnoon"
,
"Wikieup"
,
"Wilbar"
,
"Wilber"
,
"Wilberforce"
,
"Wilbraham"
,
"Wilburn"
,
"Wilburton"
,
"Wilcoe"
,
"Wilder"
,
"Wildersville"
,
"Wildhorse"
,
"Wildie"
,
"Wildomar"
,
"Wildorado"
,
"Wildrose"
,
"Wildsville"
,
"Wildwood"
,
"Wileyville"
,
"Wilkesbarre"
,
"Wilkesboro"
,
"Wilkeson"
,
"Wilkesville"
,
"Willacoochee"
,
"Willamina"
,
"Willards"
,
"Willcox"
,
"Willernie"
,
"Willet"
,
"Williamsfield"
,
"Williamsport"
,
"Williamston"
,
"Williamstown"
,
"Williamsville"
,
"Williford"
,
"Willimantic"
,
"Willingboro"
,
"Willisburg"
,
"Williston"
,
"Willisville"
,
"Willits"
,
"Willmar"
,
"Willows"
,
"Willowshade"
,
"Willowstreet"
,
"Willowwood"
,
"Willsboro"
,
"Willseyville"
,
"Willshire"
,
"Wilmar"
,
"Wilmer"
,
"Wilmerding"
,
"Wilmette"
,
"Wilmont"
,
"Wilmore"
,
"Wilmot"
,
"Wilsall"
,
"Wilsey"
,
"Wilseyville"
,
"Wilsie"
,
"Wilsonburg"
,
"Wilsondale"
,
"Wilsons"
,
"Wilsonville"
,
"Wilton"
,
"Wimauma"
,
"Wimberley"
,
"Wimbledon"
,
"Winamac"
,
"Winburne"
,
"Winchendon"
,
"Windber"
,
"Winder"
,
"Windermere"
,
"Windham"
,
"Windom"
,
"Windthorst"
,
"Windyville"
,
"Winesburg"
,
"Winfall"
,
"Winfred"
,
"Wingdale"
,
"Winger"
,
"Wingina"
,
"Wingo"
,
"Winifrede"
,
"Winigan"
,
"Winkelman"
,
"Winlock"
,
"Winn"
,
"Winnabow"
,
"Winnebago"
,
"Winneconne"
,
"Winnemucca"
,
"Winner"
,
"Winnetoon"
,
"Winnett"
,
"Winnfield"
,
"Winnisquam"
,
"Winnsboro"
,
"Winona"
,
"Winside"
,
"Winsted"
,
"Winston"
,
"Winstonville"
,
"Winterport"
,
"Winterset"
,
"Winterthur"
,
"Winterville"
,
"Winton"
,
"Wiota"
,
"Wirtz"
,
"Wisacky"
,
"Wiscasset"
,
"Wiseman"
,
"Wishek"
,
"Wishram"
,
"Wisner"
,
"Wister"
,
"Withams"
,
"Withee"
,
"Witherbee"
,
"Witmer"
,
"Witten"
,
"Wittenberg"
,
"Wittensville"
,
"Witter"
,
"Wittman"
,
"Wittmann"
,
"Wixom"
,
"Woburn"
,
"Woden"
,
"Wolbach"
,
"Wolcottville"
,
"Wolfcoal"
,
"Wolfeboro"
,
"Wolfforth"
,
"Wolford"
,
"Wolfpen"
,
"Wolftown"
,
"Wollaston"
,
"Wolsey"
,
"Wolverine"
,
"Wolverton"
,
"Womelsdorf"
,
"Wonalancet"
,
"Wonewoc"
,
"Wonnie"
,
"Woodacre"
,
"Woodbine"
,
"Woodbourne"
,
"Woodburn"
,
"Wooddale"
,
"Woodfield"
,
"Woodford"
,
"Woodhull"
,
"Woodinville"
,
"Woodleaf"
,
"Woodlyn"
,
"Woodman"
,
"Woodmere"
,
"Woodsboro"
,
"Woodscross"
,
"Woodsfield"
,
"Woodshole"
,
"Woodson"
,
"Woodstock"
,
"Woodston"
,
"Woodstown"
,
"Woodsville"
,
"Woodville"
,
"Woodworth"
,
"Woolford"
,
"Woollum"
,
"Woolrich"
,
"Woolstock"
,
"Woolwich"
,
"Woolwine"
,
"Woonsocket"
,
"Woosung"
,
"Wooton"
,
"Worden"
,
"Worland"
,
"Worley"
,
"Woronoco"
,
"Wortham"
,
"Worthing"
,
"Worthville"
,
"Worton"
,
"Woxall"
,
"Wray"
,
"Wren"
,
"Wrens"
,
"Wrenshall"
,
"Wrentham"
,
"Wrights"
,
"Wrightsboro"
,
"Wrightstown"
,
"Wrightsville"
,
"Wrightwood"
,
"Wurtsboro"
,
"Wyaconda"
,
"Wyalusing"
,
"Wyanet"
,
"Wyano"
,
"Wyarno"
,
"Wyckoff"
,
"Wyco"
,
"Wycombe"
,
"Wyeville"
,
"Wykoff"
,
"Wylliesburg"
,
"Wymer"
,
"Wymore"
,
"Wynantskill"
,
"Wyncote"
,
"Wyndmere"
,
"Wynnburg"
,
"Wynne"
,
"Wynnewood"
,
"Wynona"
,
"Wynot"
,
"Wyocena"
,
"Wyola"
,
"Wyoming"
,
"Wysox"
,
"Wytheville"
,
"Wytopitlock"
,
"Xenia"
,
"Yabucoa"
,
"Yachats"
,
"Yacolt"
,
"Yadkinville"
,
"Yalaha"
,
"Yampa"
,
"Yancey"
,
"Yanceyville"
,
"Yankeetown"
,
"Yantic"
,
"Yantis"
,
"Yaphank"
,
"Yards"
,
"Yarnell"
,
"Yatesboro"
,
"Yatesville"
,
"Yauco"
,
"Yawkey"
,
"Yeaddiss"
,
"Yeagertown"
,
"Yellowstone"
,
"Yellville"
,
"Yelm"
,
"Yemassee"
,
"Yerington"
,
"Yermo"
,
"Yeso"
,
"Yettem"
,
"Yoakum"
,
"Yolo"
,
"Yolyn"
,
"Yoncalla"
,
"York"
,
"Yorklyn"
,
"Yorkshire"
,
"Yorkville"
,
"Yosemite"
,
"Youngsville"
,
"Youngtown"
,
"Youngwood"
,
"Yountville"
,
"Yreka"
,
"Yucaipa"
,
"Yulan"
,
"Yulee"
,
"Yuma"
,
"Yutan"
,
"Zacata"
,
"Zachariah"
,
"Zachow"
,
"Zahl"
,
"Zaleski"
,
"Zalma"
,
"Zamora"
,
"Zanesfield"
,
"Zanesville"
,
"Zanoni"
,
"Zapata"
,
"Zavalla"
,
"Zearing"
,
"Zebulon"
,
"Zeeland"
,
"Zeigler"
,
"Zelienople"
,
"Zell"
,
"Zellwood"
,
"Zenda"
,
"Zenia"
,
"Zeona"
,
"Zephyr"
,
"Zieglerville"
,
"Zillah"
,
"Zim"
,
"Zionsville"
,
"Zionville"
,
"Zirconia"
,
"Zoar"
,
"Zortman"
,
"Zullinger"
,
"Zumbrota"
,
"Zuni"
,
"Zwingle"
,
"Zwolle"
]

},{}],16:[function(require,module,exports){
/* jshint node: true */
/* global location */
'use strict';

var rtc = require('rtc-tools');
var mbus = require('mbus');
var detectPlugin = require('rtc-core/plugin');
var debug = rtc.logger('rtc-quickconnect');
var extend = require('cog/extend');

/**
  # rtc-quickconnect

  This is a high level helper module designed to help you get up
  an running with WebRTC really, really quickly.  By using this module you
  are trading off some flexibility, so if you need a more flexible
  configuration you should drill down into lower level components of the
  [rtc.io](http://www.rtc.io) suite.  In particular you should check out
  [rtc](https://github.com/rtc-io/rtc).

  ## Example Usage

  In the simplest case you simply call quickconnect with a single string
  argument which tells quickconnect which server to use for signaling:

  <<< examples/simple.js

  <<< docs/events.md

  <<< docs/examples.md

  ## Regarding Signalling and a Signalling Server

  Signaling is an important part of setting up a WebRTC connection and for
  our examples we use our own test instance of the
  [rtc-switchboard](https://github.com/rtc-io/rtc-switchboard). For your
  testing and development you are more than welcome to use this also, but
  just be aware that we use this for our testing so it may go up and down
  a little.  If you need something more stable, why not consider deploying
  an instance of the switchboard yourself - it's pretty easy :)

  ## Reference

  ```
  quickconnect(signalhost, opts?) => rtc-sigaller instance (+ helpers)
  ```

  ### Valid Quick Connect Options

  The options provided to the `rtc-quickconnect` module function influence the
  behaviour of some of the underlying components used from the rtc.io suite.

  Listed below are some of the commonly used options:

  - `ns` (default: '')

    An optional namespace for your signalling room.  While quickconnect
    will generate a unique hash for the room, this can be made to be more
    unique by providing a namespace.  Using a namespace means two demos
    that have generated the same hash but use a different namespace will be
    in different rooms.

  - `room` (default: null) _added 0.6_

    Rather than use the internal hash generation
    (plus optional namespace) for room name generation, simply use this room
    name instead.  __NOTE:__ Use of the `room` option takes precendence over
    `ns`.

  - `debug` (default: false)

  Write rtc.io suite debug output to the browser console.

  - `expectedLocalStreams` (default: not specified) _added 3.0_

    By providing a positive integer value for this option will mean that
    the created quickconnect instance will wait until the specified number of
    streams have been added to the quickconnect "template" before announcing
    to the signaling server.

  - `manualJoin` (default: `false`)

    Set this value to `true` if you would prefer to call the `join` function
    to connecting to the signalling server, rather than having that happen
    automatically as soon as quickconnect is ready to.

  #### Options for Peer Connection Creation

  Options that are passed onto the
  [rtc.createConnection](https://github.com/rtc-io/rtc#createconnectionopts-constraints)
  function:

  - `iceServers`

  This provides a list of ice servers that can be used to help negotiate a
  connection between peers.

  #### Options for P2P negotiation

  Under the hood, quickconnect uses the
  [rtc/couple](https://github.com/rtc-io/rtc#rtccouple) logic, and the options
  passed to quickconnect are also passed onto this function.

**/
module.exports = function(signalhost, opts) {
  var hash = typeof location != 'undefined' && location.hash.slice(1);
  var signaller = require('rtc-pluggable-signaller')(extend({
    signaller: signalhost,

    // use the primus endpoint as a fallback in case we are talking to an
    // older switchboard instance
    endpoints: ['/', '/primus']
  }, opts));
  var getPeerData = require('./lib/getpeerdata')(signaller.peers);

  // init configurable vars
  var ns = (opts || {}).ns || '';
  var room = (opts || {}).room;
  var debugging = (opts || {}).debug;
  var allowJoin = !(opts || {}).manualJoin;
  var profile = {};
  var announced = false;

  // initialise iceServers to undefined
  // we will not announce until these have been properly initialised
  var iceServers;

  // collect the local streams
  var localStreams = [];

  // create the calls map
  var calls = signaller.calls = require('./lib/calls')(signaller, opts);

  // create the known data channels registry
  var channels = {};

  // save the plugins passed to the signaller
  var plugins = signaller.plugins = (opts || {}).plugins || [];
  var plugin = detectPlugin(plugins);
  var pluginReady;

  // check how many local streams have been expected (default: 0)
  var expectedLocalStreams = parseInt((opts || {}).expectedLocalStreams, 10) || 0;
  var announceTimer = 0;
  var updateTimer = 0;

  function checkReadyToAnnounce() {
    clearTimeout(announceTimer);
    // if we have already announced do nothing!
    if (announced) {
      return;
    }

    if (! allowJoin) {
      return;
    }

    // if we have a plugin but it's not initialized we aren't ready
    if (plugin && (! pluginReady)) {
      return;
    }

    // if we have no iceServers we aren't ready
    if (! iceServers) {
      return;
    }

    // if we are waiting for a set number of streams, then wait until we have
    // the required number
    if (expectedLocalStreams && localStreams.length < expectedLocalStreams) {
      return;
    }

    // announce ourselves to our new friend
    announceTimer = setTimeout(function() {
      var data = extend({ room: room }, profile);

      // announce and emit the local announce event
      signaller.announce(data);
      announced = true;
    }, 0);
  }

  function connect(id) {
    var data = getPeerData(id);
    var pc;
    var monitor;

    // if the room is not a match, abort
    if (data.room !== room) {
      return;
    }

    // end any call to this id so we know we are starting fresh
    calls.end(id);

    // create a peer connection
    // iceServers that have been created using genice taking precendence
    pc = rtc.createConnection(
      extend({}, opts, { iceServers: iceServers }),
      (opts || {}).constraints
    );

    signaller('peer:connect', data.id, pc, data);

    // add this connection to the calls list
    calls.create(data.id, pc);

    // add the local streams
    localStreams.forEach(function(stream) {
      pc.addStream(stream);
    });

    // add the data channels
    // do this differently based on whether the connection is a
    // master or a slave connection
    if (signaller.isMaster(data.id)) {
      debug('is master, creating data channels: ', Object.keys(channels));

      // create the channels
      Object.keys(channels).forEach(function(label) {
       gotPeerChannel(pc.createDataChannel(label, channels[label]), pc, data);
      });
    }
    else {
      pc.ondatachannel = function(evt) {
        var channel = evt && evt.channel;

        // if we have no channel, abort
        if (! channel) {
          return;
        }

        if (channels[channel.label] !== undefined) {
          gotPeerChannel(channel, pc, getPeerData(id));
        }
      };
    }

    // couple the connections
    debug('coupling ' + signaller.id + ' to ' + data.id);
    monitor = rtc.couple(pc, id, signaller, extend({}, opts, {
      logger: mbus('pc.' + id, signaller)
    }));

    signaller('peer:couple', id, pc, data, monitor);

    // once active, trigger the peer connect event
    monitor.once('connected', calls.start.bind(null, id, pc, data));
    monitor.once('closed', calls.end.bind(null, id));

    // if we are the master connnection, create the offer
    // NOTE: this only really for the sake of politeness, as rtc couple
    // implementation handles the slave attempting to create an offer
    if (signaller.isMaster(id)) {
      monitor.createOffer();
    }
  }

  function getActiveCall(peerId) {
    var call = calls.get(peerId);

    if (! call) {
      throw new Error('No active call for peer: ' + peerId);
    }

    return call;
  }

  function gotPeerChannel(channel, pc, data) {
    var channelMonitor;

    function channelReady() {
      var call = calls.get(data.id);
      var args = [ data.id, channel, data, pc ];

      // decouple the channel.onopen listener
      debug('reporting channel "' + channel.label + '" ready, have call: ' + (!!call));
      clearInterval(channelMonitor);
      channel.onopen = null;

      // save the channel
      if (call) {
        call.channels.set(channel.label, channel);
      }

      // trigger the %channel.label%:open event
      debug('triggering channel:opened events for channel: ' + channel.label);

      // emit the plain channel:opened event
      signaller.apply(signaller, ['channel:opened'].concat(args));

      // emit the channel:opened:%label% eve
      signaller.apply(
        signaller,
        ['channel:opened:' + channel.label].concat(args)
      );
    }

    debug('channel ' + channel.label + ' discovered for peer: ' + data.id);
    if (channel.readyState === 'open') {
      return channelReady();
    }

    debug('channel not ready, current state = ' + channel.readyState);
    channel.onopen = channelReady;

    // monitor the channel open (don't trust the channel open event just yet)
    channelMonitor = setInterval(function() {
      debug('checking channel state, current state = ' + channel.readyState);
      if (channel.readyState === 'open') {
        channelReady();
      }
    }, 500);
  }

  function initPlugin() {
    return plugin && plugin.init(opts, function(err) {
      if (err) {
        return console.error('Could not initialize plugin: ', err);
      }

      pluginReady = true;
      checkReadyToAnnounce();
    });
  }

  function handleLocalAnnounce(data) {
    // if we send an announce with an updated room then update our local room name
    if (data && typeof data.room != 'undefined') {
      room = data.room;
    }
  }

  function handlePeerFilter(id, data) {
    // only connect with the peer if we are ready
    data.allow = data.allow && (localStreams.length >= expectedLocalStreams);
  }

  function handlePeerUpdate(data) {
    var id = data && data.id;
    var activeCall = id && calls.get(id);

    // if we have received an update for a peer that has no active calls,
    // then pass this onto the announce handler
    if (id && (! activeCall)) {
      debug('received peer update from peer ' + id + ', no active calls');
      signaller.to(id).send('/reconnect');
      return connect(id);
    }
  }

  // if the room is not defined, then generate the room name
  if (! room) {
    // if the hash is not assigned, then create a random hash value
    if (typeof location != 'undefined' && (! hash)) {
      hash = location.hash = '' + (Math.pow(2, 53) * Math.random());
    }

    room = ns + '#' + hash;
  }

  if (debugging) {
    rtc.logger.enable.apply(rtc.logger, Array.isArray(debug) ? debugging : ['*']);
  }

  signaller.on('peer:announce', function(data) {
    connect(data.id);
  });

  signaller.on('peer:update', handlePeerUpdate);

  signaller.on('message:reconnect', function(sender) {
    connect(sender.id);
  });



  /**
    ### Quickconnect Broadcast and Data Channel Helper Functions

    The following are functions that are patched into the `rtc-signaller`
    instance that make working with and creating functional WebRTC applications
    a lot simpler.

  **/

  /**
    #### addStream

    ```
    addStream(stream:MediaStream) => qc
    ```

    Add the stream to active calls and also save the stream so that it
    can be added to future calls.

  **/
  signaller.broadcast = signaller.addStream = function(stream) {
    localStreams.push(stream);

    // if we have any active calls, then add the stream
    calls.values().forEach(function(data) {
      data.pc.addStream(stream);
    });

    checkReadyToAnnounce();
    return signaller;
  };

  /**
    #### endCalls()

    The `endCalls` function terminates all the active calls that have been
    created in this quickconnect instance.  Calling `endCalls` does not
    kill the connection with the signalling server.

  **/
  signaller.endCalls = function() {
    calls.keys().forEach(calls.end);
  };

  /**
    #### close()

    The `close` function provides a convenient way of closing all associated
    peer connections.  This function simply uses the `endCalls` function and
    the underlying `leave` function of the signaller to do a "full cleanup"
    of all connections.
  **/
  signaller.close = function() {
    signaller.endCalls();
    signaller.leave();
  };

  /**
    #### createDataChannel(label, config)

    Request that a data channel with the specified `label` is created on
    the peer connection.  When the data channel is open and available, an
    event will be triggered using the label of the data channel.

    For example, if a new data channel was requested using the following
    call:

    ```js
    var qc = quickconnect('https://switchboard.rtc.io/').createDataChannel('test');
    ```

    Then when the data channel is ready for use, a `test:open` event would
    be emitted by `qc`.

  **/
  signaller.createDataChannel = function(label, opts) {
    // create a channel on all existing calls
    calls.keys().forEach(function(peerId) {
      var call = calls.get(peerId);
      var dc;

      // if we are the master connection, create the data channel
      if (call && call.pc && signaller.isMaster(peerId)) {
        dc = call.pc.createDataChannel(label, opts);
        gotPeerChannel(dc, call.pc, getPeerData(peerId));
      }
    });

    // save the data channel opts in the local channels dictionary
    channels[label] = opts || null;

    return signaller;
  };

  /**
    #### join()

    The `join` function is used when `manualJoin` is set to true when creating
    a quickconnect instance.  Call the `join` function once you are ready to
    join the signalling server and initiate connections with other people.

  **/
  signaller.join = function() {
    allowJoin = true;
    checkReadyToAnnounce();
  };

  /**
    #### `get(name)`

    The `get` function returns the property value for the specified property name.
  **/
  signaller.get = function(name) {
    return profile[name];
  };

  /**
    #### `getLocalStreams()`

    Return a copy of the local streams that have currently been configured
  **/
  signaller.getLocalStreams = function() {
    return [].concat(localStreams);
  };

  /**
    #### reactive()

    Flag that this session will be a reactive connection.

  **/
  signaller.reactive = function() {
    // add the reactive flag
    opts = opts || {};
    opts.reactive = true;

    // chain
    return signaller;
  };

  /**
    #### removeStream

    ```
    removeStream(stream:MediaStream)
    ```

    Remove the specified stream from both the local streams that are to
    be connected to new peers, and also from any active calls.

  **/
  signaller.removeStream = function(stream) {
    var localIndex = localStreams.indexOf(stream);

    // remove the stream from any active calls
    calls.values().forEach(function(call) {
      call.pc.removeStream(stream);
    });

    // remove the stream from the localStreams array
    if (localIndex >= 0) {
      localStreams.splice(localIndex, 1);
    }

    return signaller;
  };

  /**
    #### requestChannel

    ```
    requestChannel(targetId, label, callback)
    ```

    This is a function that can be used to respond to remote peers supplying
    a data channel as part of their configuration.  As per the `receiveStream`
    function this function will either fire the callback immediately if the
    channel is already available, or once the channel has been discovered on
    the call.

  **/
  signaller.requestChannel = function(targetId, label, callback) {
    var call = getActiveCall(targetId);
    var channel = call && call.channels.get(label);

    // if we have then channel trigger the callback immediately
    if (channel) {
      callback(null, channel);
      return signaller;
    }

    // if not, wait for it
    signaller.once('channel:opened:' + label, function(id, dc) {
      callback(null, dc);
    });

    return signaller;
  };

  /**
    #### requestStream

    ```
    requestStream(targetId, idx, callback)
    ```

    Used to request a remote stream from a quickconnect instance. If the
    stream is already available in the calls remote streams, then the callback
    will be triggered immediately, otherwise this function will monitor
    `stream:added` events and wait for a match.

    In the case that an unknown target is requested, then an exception will
    be thrown.
  **/
  signaller.requestStream = function(targetId, idx, callback) {
    var call = getActiveCall(targetId);
    var stream;

    function waitForStream(peerId) {
      if (peerId !== targetId) {
        return;
      }

      // get the stream
      stream = call.pc.getRemoteStreams()[idx];

      // if we have the stream, then remove the listener and trigger the cb
      if (stream) {
        signaller.removeListener('stream:added', waitForStream);
        callback(null, stream);
      }
    }

    // look for the stream in the remote streams of the call
    stream = call.pc.getRemoteStreams()[idx];

    // if we found the stream then trigger the callback
    if (stream) {
      callback(null, stream);
      return signaller;
    }

    // otherwise wait for the stream
    signaller.on('stream:added', waitForStream);
    return signaller;
  };

  /**
    #### profile(data)

    Update the profile data with the attached information, so when
    the signaller announces it includes this data in addition to any
    room and id information.

  **/
  signaller.profile = function(data) {
    extend(profile, data);

    // if we have already announced, then reannounce our profile to provide
    // others a `peer:update` event
    if (announced) {
      clearTimeout(updateTimer);
      updateTimer = setTimeout(function() {
        signaller.announce(profile);
      }, (opts || {}).updateDelay || 1000);
    }

    return signaller;
  };

  /**
    #### waitForCall

    ```
    waitForCall(targetId, callback)
    ```

    Wait for a call from the specified targetId.  If the call is already
    active the callback will be fired immediately, otherwise we will wait
    for a `call:started` event that matches the requested `targetId`

  **/
  signaller.waitForCall = function(targetId, callback) {
    var call = calls.get(targetId);

    if (call && call.active) {
      callback(null, call.pc);
      return signaller;
    }

    signaller.on('call:started', function handleNewCall(id) {
      if (id === targetId) {
        signaller.removeListener('call:started', handleNewCall);
        callback(null, calls.get(id).pc);
      }
    });
  };

  // if we have an expected number of local streams, then use a filter to
  // check if we should respond
  if (expectedLocalStreams) {
    signaller.on('peer:filter', handlePeerFilter);
  }

  // respond to local announce messages
  signaller.on('local:announce', handleLocalAnnounce);

  // handle ping messages
  signaller.on('message:ping', calls.ping);

  // use genice to find our iceServers
  require('rtc-core/genice')(opts, function(err, servers) {
    if (err) {
      return console.error('could not find iceServers: ', err);
    }

    iceServers = servers;
    checkReadyToAnnounce();
  });

  // if we plugin is active, then initialize it
  if (plugin) {
    initPlugin();
  }

  // pass the signaller on
  return signaller;
};

},{"./lib/calls":17,"./lib/getpeerdata":18,"cog/extend":21,"mbus":26,"rtc-core/genice":28,"rtc-core/plugin":30,"rtc-pluggable-signaller":31,"rtc-tools":64}],17:[function(require,module,exports){
(function (process){
var rtc = require('rtc-tools');
var debug = rtc.logger('rtc-quickconnect');
var cleanup = require('rtc-tools/cleanup');
var getable = require('cog/getable');

module.exports = function(signaller, opts) {
  var calls = getable({});
  var getPeerData = require('./getpeerdata')(signaller.peers);
  var heartbeat;

  function create(id, pc) {
    calls.set(id, {
      active: false,
      pc: pc,
      channels: getable({}),
      streams: [],
      lastping: Date.now()
    });
  }

  function createStreamAddHandler(id) {
    return function(evt) {
      debug('peer ' + id + ' added stream');
      updateRemoteStreams(id);
      receiveRemoteStream(id)(evt.stream);
    };
  }

  function createStreamRemoveHandler(id) {
    return function(evt) {
      debug('peer ' + id + ' removed stream');
      updateRemoteStreams(id);
      signaller('stream:removed', id, evt.stream);
    };
  }

  function end(id) {
    var call = calls.get(id);

    // if we have no data, then do nothing
    if (! call) {
      return;
    }

    // if we have no data, then return
    call.channels.keys().forEach(function(label) {
      var channel = call.channels.get(label);
      var args = [id, channel, label];

      // emit the plain channel:closed event
      signaller.apply(signaller, ['channel:closed'].concat(args));

      // emit the labelled version of the event
      signaller.apply(signaller, ['channel:closed:' + label].concat(args));

      // decouple the events
      channel.onopen = null;
    });

    // trigger stream:removed events for each of the remotestreams in the pc
    call.streams.forEach(function(stream) {
      signaller('stream:removed', id, stream);
    });

    // delete the call data
    calls.delete(id);

    // if we have no more calls, disable the heartbeat
    if (calls.keys().length === 0) {
      resetHeartbeat();
    }

    // trigger the call:ended event
    signaller('call:ended', id, call.pc);

    // ensure the peer connection is properly cleaned up
    cleanup(call.pc);
  }

  function ping(sender) {
    var call = calls.get(sender && sender.id);

    // set the last ping for the data
    if (call) {
      call.lastping = Date.now();
    }
  }

  function receiveRemoteStream(id) {
    return function(stream) {
      signaller('stream:added', id, stream, getPeerData(id));
    };
  }

  function resetHeartbeat() {
    clearInterval(heartbeat);
    heartbeat = 0;
  }

  function start(id, pc, data) {
    var call = calls.get(id);
    var streams = [].concat(pc.getRemoteStreams());

    // flag the call as active
    call.active = true;
    call.streams = [].concat(pc.getRemoteStreams());

    pc.onaddstream = createStreamAddHandler(id);
    pc.onremovestream = createStreamRemoveHandler(id);

    debug(signaller.id + ' - ' + id + ' call start: ' + streams.length + ' streams');
    signaller('call:started', id, pc, data);

    // configure the heartbeat timer
    call.lastping = Date.now();
    heartbeat = heartbeat || require('./heartbeat')(signaller, calls, opts);

    // examine the existing remote streams after a short delay
    process.nextTick(function() {
      // iterate through any remote streams
      streams.forEach(receiveRemoteStream(id));
    });
  }

  function updateRemoteStreams(id) {
    var call = calls.get(id);

    if (call && call.pc) {
      call.streams = [].concat(call.pc.getRemoteStreams());
    }
  }

  calls.create = create;
  calls.end = end;
  calls.ping = ping;
  calls.start = start;

  return calls;
};

}).call(this,require('_process'))
},{"./getpeerdata":18,"./heartbeat":19,"_process":94,"cog/getable":22,"rtc-tools":64,"rtc-tools/cleanup":60}],18:[function(require,module,exports){
module.exports = function(peers) {
  return function(id) {
    var peer = peers.get(id);
    return peer && peer.data;
  };
};

},{}],19:[function(require,module,exports){
module.exports = function(signaller, calls, opts) {
  var heartbeat = (opts || {}).heartbeat || 2500;
  var heartbeatTimer = 0;

  function send() {
    var tickInactive = (Date.now() - (heartbeat * 4));

    // iterate through our established calls
    calls.keys().forEach(function(id) {
      var call = calls.get(id);

      // if the call ping is too old, end the call
      if (call.active && call.lastping < tickInactive) {
        signaller('call:expired', id, call.pc);
        return calls.end(id);
      }

      // send a ping message
      signaller.to(id).send('/ping');
    });
  }

  if (! heartbeat) {
    return;
  }

  return setInterval(send, heartbeat);
};

},{}],20:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
## cog/defaults

```js
var defaults = require('cog/defaults');
```

### defaults(target, *)

Shallow copy object properties from the supplied source objects (*) into
the target object, returning the target object once completed.  Do not,
however, overwrite existing keys with new values:

```js
defaults({ a: 1, b: 2 }, { c: 3 }, { d: 4 }, { b: 5 }));
```

See an example on [requirebin](http://requirebin.com/?gist=6079475).
**/
module.exports = function(target) {
  // ensure we have a target
  target = target || {};

  // iterate through the sources and copy to the target
  [].slice.call(arguments, 1).forEach(function(source) {
    if (! source) {
      return;
    }

    for (var prop in source) {
      if (target[prop] === void 0) {
        target[prop] = source[prop];
      }
    }
  });

  return target;
};
},{}],21:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
## cog/extend

```js
var extend = require('cog/extend');
```

### extend(target, *)

Shallow copy object properties from the supplied source objects (*) into
the target object, returning the target object once completed:

```js
extend({ a: 1, b: 2 }, { c: 3 }, { d: 4 }, { b: 5 }));
```

See an example on [requirebin](http://requirebin.com/?gist=6079475).
**/
module.exports = function(target) {
  [].slice.call(arguments, 1).forEach(function(source) {
    if (! source) {
      return;
    }

    for (var prop in source) {
      target[prop] = source[prop];
    }
  });

  return target;
};
},{}],22:[function(require,module,exports){
/**
  ## cog/getable

  Take an object and provide a wrapper that allows you to `get` and
  `set` values on that object.

**/
module.exports = function(target) {
  function get(key) {
    return target[key];
  }

  function set(key, value) {
    target[key] = value;
  }

  function remove(key) {
    return delete target[key];
  }

  function keys() {
    return Object.keys(target);
  };

  function values() {
    return Object.keys(target).map(function(key) {
      return target[key];
    });
  };

  if (typeof target != 'object') {
    return target;
  }

  return {
    get: get,
    set: set,
    remove: remove,
    delete: remove,
    keys: keys,
    values: values
  };
};

},{}],23:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## cog/jsonparse

  ```js
  var jsonparse = require('cog/jsonparse');
  ```

  ### jsonparse(input)

  This function will attempt to automatically detect stringified JSON, and
  when detected will parse into JSON objects.  The function looks for strings
  that look and smell like stringified JSON, and if found attempts to
  `JSON.parse` the input into a valid object.

**/
module.exports = function(input) {
  var isString = typeof input == 'string' || (input instanceof String);
  var reNumeric = /^\-?\d+\.?\d*$/;
  var shouldParse ;
  var firstChar;
  var lastChar;

  if ((! isString) || input.length < 2) {
    if (isString && reNumeric.test(input)) {
      return parseFloat(input);
    }

    return input;
  }

  // check for true or false
  if (input === 'true' || input === 'false') {
    return input === 'true';
  }

  // check for null
  if (input === 'null') {
    return null;
  }

  // get the first and last characters
  firstChar = input.charAt(0);
  lastChar = input.charAt(input.length - 1);

  // determine whether we should JSON.parse the input
  shouldParse =
    (firstChar == '{' && lastChar == '}') ||
    (firstChar == '[' && lastChar == ']') ||
    (firstChar == '"' && lastChar == '"');

  if (shouldParse) {
    try {
      return JSON.parse(input);
    }
    catch (e) {
      // apparently it wasn't valid json, carry on with regular processing
    }
  }


  return reNumeric.test(input) ? parseFloat(input) : input;
};
},{}],24:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## cog/logger

  ```js
  var logger = require('cog/logger');
  ```

  Simple browser logging offering similar functionality to the
  [debug](https://github.com/visionmedia/debug) module.

  ### Usage

  Create your self a new logging instance and give it a name:

  ```js
  var debug = logger('phil');
  ```

  Now do some debugging:

  ```js
  debug('hello');
  ```

  At this stage, no log output will be generated because your logger is
  currently disabled.  Enable it:

  ```js
  logger.enable('phil');
  ```

  Now do some more logger:

  ```js
  debug('Oh this is so much nicer :)');
  // --> phil: Oh this is some much nicer :)
  ```

  ### Reference
**/

var active = [];
var unleashListeners = [];
var targets = [ console ];

/**
  #### logger(name)

  Create a new logging instance.
**/
var logger = module.exports = function(name) {
  // initial enabled check
  var enabled = checkActive();

  function checkActive() {
    return enabled = active.indexOf('*') >= 0 || active.indexOf(name) >= 0;
  }

  // register the check active with the listeners array
  unleashListeners[unleashListeners.length] = checkActive;

  // return the actual logging function
  return function() {
    var args = [].slice.call(arguments);

    // if we have a string message
    if (typeof args[0] == 'string' || (args[0] instanceof String)) {
      args[0] = name + ': ' + args[0];
    }

    // if not enabled, bail
    if (! enabled) {
      return;
    }

    // log
    targets.forEach(function(target) {
      target.log.apply(target, args);
    });
  };
};

/**
  #### logger.reset()

  Reset logging (remove the default console logger, flag all loggers as
  inactive, etc, etc.
**/
logger.reset = function() {
  // reset targets and active states
  targets = [];
  active = [];

  return logger.enable();
};

/**
  #### logger.to(target)

  Add a logging target.  The logger must have a `log` method attached.

**/
logger.to = function(target) {
  targets = targets.concat(target || []);

  return logger;
};

/**
  #### logger.enable(names*)

  Enable logging via the named logging instances.  To enable logging via all
  instances, you can pass a wildcard:

  ```js
  logger.enable('*');
  ```

  __TODO:__ wildcard enablers
**/
logger.enable = function() {
  // update the active
  active = active.concat([].slice.call(arguments));

  // trigger the unleash listeners
  unleashListeners.forEach(function(listener) {
    listener();
  });

  return logger;
};
},{}],25:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ## cog/throttle

  ```js
  var throttle = require('cog/throttle');
  ```

  ### throttle(fn, delay, opts)

  A cherry-pickable throttle function.  Used to throttle `fn` to ensure
  that it can be called at most once every `delay` milliseconds.  Will
  fire first event immediately, ensuring the next event fired will occur
  at least `delay` milliseconds after the first, and so on.

**/
module.exports = function(fn, delay, opts) {
  var lastExec = (opts || {}).leading !== false ? 0 : Date.now();
  var trailing = (opts || {}).trailing;
  var timer;
  var queuedArgs;
  var queuedScope;

  // trailing defaults to true
  trailing = trailing || trailing === undefined;
  
  function invokeDefered() {
    fn.apply(queuedScope, queuedArgs || []);
    lastExec = Date.now();
  }

  return function() {
    var tick = Date.now();
    var elapsed = tick - lastExec;

    // always clear the defered timer
    clearTimeout(timer);

    if (elapsed < delay) {
      queuedArgs = [].slice.call(arguments, 0);
      queuedScope = this;

      return trailing && (timer = setTimeout(invokeDefered, delay - elapsed));
    }

    // call the function
    lastExec = tick;
    fn.apply(this, arguments);
  };
};
},{}],26:[function(require,module,exports){
var reDelim = /[\.\:]/;

/**
  # mbus

  If Node's EventEmitter and Eve were to have a child, it might look something like this.
  No wildcard support at this stage though...

  ## Example Usage

  <<< docs/usage.md

  ## Reference

  ### `mbus(namespace?, parent?, scope?)`

  Create a new message bus with `namespace` inheriting from the `parent`
  mbus instance.  If events from this message bus should be triggered with
  a specific `this` scope, then specify it using the `scope` argument.

**/

var createBus = module.exports = function(namespace, parent, scope) {
  var registry = {};
  var feeds = [];

  function bus(name) {
    var args = [].slice.call(arguments, 1);
    var delimited = normalize(name);
    var handlers = registry[delimited] || [];
    var results;

    // send through the feeds
    feeds.forEach(function(feed) {
      feed({ name: delimited, args: args });
    });

    // run the registered handlers
    results = [].concat(handlers).map(function(handler) {
      return handler.apply(scope || this, args);
    });

    // run the parent handlers
    if (bus.parent) {
      results = results.concat(
        bus.parent.apply(
          scope || this,
          [(namespace ? namespace + '.' : '') + delimited].concat(args)
        )
      );
    }

    return results;
  }

  /**
    ### `mbus#clear()`

    Reset the handler registry, which essential deregisters all event listeners.

    _Alias:_ `removeAllListeners`
  **/
  function clear(name) {
    // if we have a name, reset handlers for that handler
    if (name) {
      delete registry[normalize(name)];
    }
    // otherwise, reset the entire handler registry
    else {
      registry = {};
    }
  }

  /**
    ### `mbus#feed(handler)`

    Attach a handler function that will see all events that are sent through
    this bus in an "object stream" format that matches the following format:

    ```
    { name: 'event.name', args: [ 'event', 'args' ] }
    ```

    The feed function returns a function that can be called to stop the feed
    sending data.

  **/
  function feed(handler) {
    function stop() {
      feeds.splice(feeds.indexOf(handler), 1);
    }

    feeds.push(handler);
    return stop;
  }

  function normalize(name) {
    return (Array.isArray(name) ? name : name.split(reDelim)).join('.');
  }

  /**
    ### `mbus#off(name, handler)`

    Deregister an event handler.
  **/
  function off(name, handler) {
    var handlers = registry[normalize(name)] || [];
    var idx = handlers ? handlers.indexOf(handler._actual || handler) : -1;

    if (idx >= 0) {
      handlers.splice(idx, 1);
    }
  }

  /**
    ### `mbus#on(name, handler)`

    Register an event handler for the event `name`.

  **/
  function on(name, handler) {
    var handlers;

    name = normalize(name);
    handlers = registry[name];

    if (handlers) {
      handlers.push(handler);
    }
    else {
      registry[name] = [ handler ];
    }

    return bus;
  }


  /**
    ### `mbus#once(name, handler)`

    Register an event handler for the event `name` that will only
    trigger once (i.e. the handler will be deregistered immediately after
    being triggered the first time).

  **/
  function once(name, handler) {
    function handleEvent() {
      var result = handler.apply(this, arguments);

      bus.off(name, handleEvent);
      return result;
    }

    handler._actual = handleEvent;
    return on(name, handleEvent);
  }

  if (typeof namespace == 'function') {
    parent = namespace;
    namespace = '';
  }

  namespace = normalize(namespace || '');

  bus.clear = bus.removeAllListeners = clear;
  bus.feed = feed;
  bus.on = bus.addListener = on;
  bus.once = once;
  bus.off = bus.removeListener = off;
  bus.parent = parent || (namespace && createBus());

  return bus;
};

},{}],27:[function(require,module,exports){
/* jshint node: true */
/* global window: false */
/* global navigator: false */

'use strict';

var browser = require('detect-browser');

/**
  ### `rtc-core/detect`

  A browser detection helper for accessing prefix-free versions of the various
  WebRTC types.

  ### Example Usage

  If you wanted to get the native `RTCPeerConnection` prototype in any browser
  you could do the following:

  ```js
  var detect = require('rtc-core/detect'); // also available in rtc/detect
  var RTCPeerConnection = detect('RTCPeerConnection');
  ```

  This would provide whatever the browser prefixed version of the
  RTCPeerConnection is available (`webkitRTCPeerConnection`,
  `mozRTCPeerConnection`, etc).
**/
var detect = module.exports = function(target, opts) {
  var attach = (opts || {}).attach;
  var prefixIdx;
  var prefix;
  var testName;
  var hostObject = this || (typeof window != 'undefined' ? window : undefined);

  // initialise to default prefixes
  // (reverse order as we use a decrementing for loop)
  var prefixes = ((opts || {}).prefixes || ['ms', 'o', 'moz', 'webkit']).concat('');

  // if we have no host object, then abort
  if (! hostObject) {
    return;
  }

  // iterate through the prefixes and return the class if found in global
  for (prefixIdx = prefixes.length; prefixIdx--; ) {
    prefix = prefixes[prefixIdx];

    // construct the test class name
    // if we have a prefix ensure the target has an uppercase first character
    // such that a test for getUserMedia would result in a
    // search for webkitGetUserMedia
    testName = prefix + (prefix ?
                            target.charAt(0).toUpperCase() + target.slice(1) :
                            target);

    if (typeof hostObject[testName] != 'undefined') {
      // update the last used prefix
      detect.browser = detect.browser || prefix.toLowerCase();

      if (attach) {
         hostObject[target] = hostObject[testName];
      }

      return hostObject[testName];
    }
  }
};

// detect mozilla (yes, this feels dirty)
detect.moz = typeof navigator != 'undefined' && !!navigator.mozGetUserMedia;

// set the browser and browser version
detect.browser = browser.name;
detect.browserVersion = detect.version = browser.version;

},{"detect-browser":29}],28:[function(require,module,exports){
/**
  ### `rtc-core/genice`

  Respond appropriately to options that are passed to packages like
  `rtc-quickconnect` and trigger a `callback` (error first) with iceServer
  values.

  The function looks for either of the following keys in the options, in
  the following order or precedence:

  1. `ice` - this can either be an array of ice server values or a generator
     function (in the same format as this function).  If this key contains a
     value then any servers specified in the `iceServers` key (2) will be
     ignored.

  2. `iceServers` - an array of ice server values.
**/
module.exports = function(opts, callback) {
  var ice = (opts || {}).ice;
  var iceServers = (opts || {}).iceServers;

  if (typeof ice == 'function') {
    return ice(opts, callback);
  }
  else if (Array.isArray(ice)) {
    return callback(null, [].concat(ice));
  }

  callback(null, [].concat(iceServers || []));
};

},{}],29:[function(require,module,exports){
var browsers = [
  [ 'chrome', /Chrom(?:e|ium)\/([0-9\.]+)(:?\s|$)/ ],
  [ 'firefox', /Firefox\/([0-9\.]+)(?:\s|$)/ ],
  [ 'opera', /Opera\/([0-9\.]+)(?:\s|$)/ ],
  [ 'ie', /Trident\/7\.0.*rv\:([0-9\.]+)\).*Gecko$/ ],
  [ 'ie', /MSIE\s([0-9\.]+);.*Trident\/[4-7].0/ ],
  [ 'ie', /MSIE\s(7\.0)/ ],
  [ 'bb10', /BB10;\sTouch.*Version\/([0-9\.]+)/ ],
  [ 'android', /Android\s([0-9\.]+)/ ],
  [ 'ios', /iPad\;\sCPU\sOS\s([0-9\._]+)/ ],
  [ 'ios',  /iPhone\;\sCPU\siPhone\sOS\s([0-9\._]+)/ ],
  [ 'safari', /Safari\/([0-9\._]+)/ ]
];

var match = browsers.map(match).filter(isMatch)[0];
var parts = match && match[3].split(/[._]/).slice(0,3);

while (parts && parts.length < 3) {
  parts.push('0');
}

// set the name and version
exports.name = match && match[0];
exports.version = parts && parts.join('.');

function match(pair) {
  return pair.concat(pair[1].exec(navigator.userAgent));
}

function isMatch(pair) {
  return !!pair[2];
}

},{}],30:[function(require,module,exports){
var detect = require('./detect');
var requiredFunctions = [
  'init'
];

function isSupported(plugin) {
  return plugin && typeof plugin.supported == 'function' && plugin.supported(detect);
}

function isValid(plugin) {
  var supportedFunctions = requiredFunctions.filter(function(fn) {
    return typeof plugin[fn] == 'function';
  });

  return supportedFunctions.length === requiredFunctions.length;
}

module.exports = function(plugins) {
  return [].concat(plugins || []).filter(isSupported).filter(isValid)[0];
}

},{"./detect":27}],31:[function(require,module,exports){
/**
  # rtc-pluggable-signaller

  By using `rtc-pluggable-signaller` in your code, you provide the ability
  for your package to customize which signalling client it uses (and
  thus have significant control) over how signalling operates in your
  environment.

  ## How it Works

  The pluggable signaller looks in the provided `opts` for a `signaller`
  attribute.  If the value of this attribute is a string, then it is
  assumed that you wish to use the default
  [`rtc-signaller`](https://github.com/rtc-io/rtc-signaller) in your
  package.  If, however, it is not a string value then it will be passed
  straight back as the signaller (assuming that you have provided an
  object that is compliant with the rtc.io signalling API).

**/
module.exports = function(opts) {
  var signaller = (opts || {}).signaller;
  var messenger = (opts || {}).messenger || require('rtc-switchboard-messenger');

  if (typeof signaller == 'string' || (signaller instanceof String)) {
    return require('rtc-signaller')(messenger(signaller, opts), opts);
  }

  return signaller;
};

},{"rtc-signaller":32,"rtc-switchboard-messenger":51}],32:[function(require,module,exports){
/* jshint node: true */
'use strict';

var detect = require('rtc-core/detect');
var extend = require('cog/extend');
var mbus = require('mbus');
var getable = require('cog/getable');
var uuid = require('cuid');
var pull = require('pull-stream');
var pushable = require('pull-pushable');
var prepare = require('rtc-signal/prepare');
var createQueue = require('pull-pushable');

// ready state constants
var RS_DISCONNECTED = 0;
var RS_CONNECTING = 1;
var RS_CONNECTED = 2;

// initialise signaller metadata so we don't have to include the package.json
// TODO: make this checkable with some kind of prepublish script
var metadata = {
  version: '6.2.1'
};

/**
  # rtc-signaller

  The `rtc-signaller` module provides a transportless signalling
  mechanism for WebRTC.

  ## Purpose

  <<< docs/purpose.md

  ## Getting Started

  While the signaller is capable of communicating by a number of different
  messengers (i.e. anything that can send and receive messages over a wire)
  it comes with support for understanding how to connect to an
  [rtc-switchboard](https://github.com/rtc-io/rtc-switchboard) out of the box.

  The following code sample demonstrates how:

  <<< examples/getting-started.js

  <<< docs/events.md

  <<< docs/signalflow-diagrams.md

  <<< docs/identifying-participants.md

  ## Reference

  The `rtc-signaller` module is designed to be used primarily in a functional
  way and when called it creates a new signaller that will enable
  you to communicate with other peers via your messaging network.

  ```js
  // create a signaller from something that knows how to send messages
  var signaller = require('rtc-signaller')(messenger);
  ```

  As demonstrated in the getting started guide, you can also pass through
  a string value instead of a messenger instance if you simply want to
  connect to an existing `rtc-switchboard` instance.

**/
module.exports = function(messenger, opts) {
  var autoconnect = (opts || {}).autoconnect;
  var reconnect = (opts || {}).reconnect;
  var queue = createQueue();
  var connectionCount = 0;

  // create the signaller
  var signaller = require('rtc-signal/signaller')(opts, bufferMessage);

  var announced = false;
  var announceTimer = 0;
  var readyState = RS_DISCONNECTED;

  function bufferMessage(message) {
    queue.push(message);

    // if we are not connected (and should autoconnect), then attempt connection
    if (readyState === RS_DISCONNECTED && (autoconnect === undefined || autoconnect)) {
      connect();
    }
  }

  function handleDisconnect() {
    if (reconnect === undefined || reconnect) {
      setTimeout(connect, 50);
    }
  }

  /**
    ### `signaller.connect()`

    Manually connect the signaller using the supplied messenger.

    __NOTE:__ This should never have to be called if the default setting
    for `autoconnect` is used.
  **/
  var connect = signaller.connect = function() {
    // if we are already connecting then do nothing
    if (readyState === RS_CONNECTING) {
      return;
    }

    // initiate the messenger
    readyState = RS_CONNECTING;
    messenger(function(err, source, sink) {
      if (err) {
        readyState = RS_DISCONNECTED;
        return signaller('error', err);
      }

      // increment the connection count
      connectionCount += 1;

      // flag as connected
      readyState = RS_CONNECTED;

      // pass messages to the processor
      pull(
        source,

        // monitor disconnection
        pull.through(null, function() {
          queue = createQueue();
          readyState = RS_DISCONNECTED;
          signaller('disconnected');
        }),
        pull.drain(signaller._process)
      );

      // pass the queue to the sink
      pull(queue, sink);

      // handle disconnection
      signaller.removeListener('disconnected', handleDisconnect);
      signaller.on('disconnected', handleDisconnect);

      // trigger the connected event
      signaller('connected');

      // if this is a reconnection, then reannounce
      if (announced && connectionCount > 1) {
        signaller._announce();
      }
    });
  };

  /**
    ### announce(data?)

    The `announce` function of the signaller will pass an `/announce` message
    through the messenger network.  When no additional data is supplied to
    this function then only the id of the signaller is sent to all active
    members of the messenging network.

    #### Joining Rooms

    To join a room using an announce call you simply provide the name of the
    room you wish to join as part of the data block that you annouce, for
    example:

    ```js
    signaller.announce({ room: 'testroom' });
    ```

    Signalling servers (such as
    [rtc-switchboard](https://github.com/rtc-io/rtc-switchboard)) will then
    place your peer connection into a room with other peers that have also
    announced in this room.

    Once you have joined a room, the server will only deliver messages that
    you `send` to other peers within that room.

    #### Providing Additional Announce Data

    There may be instances where you wish to send additional data as part of
    your announce message in your application.  For instance, maybe you want
    to send an alias or nick as part of your announce message rather than just
    use the signaller's generated id.

    If for instance you were writing a simple chat application you could join
    the `webrtc` room and tell everyone your name with the following announce
    call:

    ```js
    signaller.announce({
      room: 'webrtc',
      nick: 'Damon'
    });
    ```

    #### Announcing Updates

    The signaller is written to distinguish between initial peer announcements
    and peer data updates (see the docs on the announce handler below). As
    such it is ok to provide any data updates using the announce method also.

    For instance, I could send a status update as an announce message to flag
    that I am going offline:

    ```js
    signaller.announce({ status: 'offline' });
    ```

  **/
  signaller.announce = function(data) {
    announced = true;
    signaller._update(data);
    clearTimeout(announceTimer);

    // send the attributes over the network
    return announceTimer = setTimeout(signaller._announce, (opts || {}).announceDelay || 10);
  };

  /**
    ### leave()

    Tell the signalling server we are leaving.  Calling this function is
    usually not required though as the signalling server should issue correct
    `/leave` messages when it detects a disconnect event.

  **/
  signaller.leave = signaller.close = function() {
    // send the leave signal
    signaller.send('/leave', { id: signaller.id });

    // stop announcing on reconnect
    signaller.removeListener('disconnected', handleDisconnect);
    signaller.removeListener('connected', signaller._announce);

    // end our current queue
    queue.end();

    // set connected to false
    readyState = RS_DISCONNECTED;
  };

  // update the signaller agent
  signaller._update({ agent: 'signaller@' + metadata.version });

  // autoconnect
  if (autoconnect === undefined || autoconnect) {
    connect();
  }

  return signaller;
};

},{"cog/extend":21,"cog/getable":22,"cuid":33,"mbus":26,"pull-pushable":34,"pull-stream":41,"rtc-core/detect":27,"rtc-signal/prepare":48,"rtc-signal/signaller":50}],33:[function(require,module,exports){
/**
 * cuid.js
 * Collision-resistant UID generator for browsers and node.
 * Sequential for fast db lookups and recency sorting.
 * Safe for element IDs and server-side lookups.
 *
 * Extracted from CLCTR
 *
 * Copyright (c) Eric Elliott 2012
 * MIT License
 */

/*global window, navigator, document, require, process, module */
(function (app) {
  'use strict';
  var namespace = 'cuid',
    c = 0,
    blockSize = 4,
    base = 36,
    discreteValues = Math.pow(base, blockSize),

    pad = function pad(num, size) {
      var s = "000000000" + num;
      return s.substr(s.length-size);
    },

    randomBlock = function randomBlock() {
      return pad((Math.random() *
            discreteValues << 0)
            .toString(base), blockSize);
    },

    safeCounter = function () {
      c = (c < discreteValues) ? c : 0;
      c++; // this is not subliminal
      return c - 1;
    },

    api = function cuid() {
      // Starting with a lowercase letter makes
      // it HTML element ID friendly.
      var letter = 'c', // hard-coded allows for sequential access

        // timestamp
        // warning: this exposes the exact date and time
        // that the uid was created.
        timestamp = (new Date().getTime()).toString(base),

        // Prevent same-machine collisions.
        counter,

        // A few chars to generate distinct ids for different
        // clients (so different computers are far less
        // likely to generate the same id)
        fingerprint = api.fingerprint(),

        // Grab some more chars from Math.random()
        random = randomBlock() + randomBlock();

        counter = pad(safeCounter().toString(base), blockSize);

      return  (letter + timestamp + counter + fingerprint + random);
    };

  api.slug = function slug() {
    var date = new Date().getTime().toString(36),
      counter,
      print = api.fingerprint().slice(0,1) +
        api.fingerprint().slice(-1),
      random = randomBlock().slice(-2);

      counter = safeCounter().toString(36).slice(-4);

    return date.slice(-2) +
      counter + print + random;
  };

  api.globalCount = function globalCount() {
    // We want to cache the results of this
    var cache = (function calc() {
        var i,
          count = 0;

        for (i in window) {
          count++;
        }

        return count;
      }());

    api.globalCount = function () { return cache; };
    return cache;
  };

  api.fingerprint = function browserPrint() {
    return pad((navigator.mimeTypes.length +
      navigator.userAgent.length).toString(36) +
      api.globalCount().toString(36), 4);
  };

  // don't change anything from here down.
  if (app.register) {
    app.register(namespace, api);
  } else if (typeof module !== 'undefined') {
    module.exports = api;
  } else {
    app[namespace] = api;
  }

}(this.applitude || this));

},{}],34:[function(require,module,exports){
var pull = require('pull-stream')

module.exports = pull.Source(function (onClose) {
  var buffer = [], cbs = [], waiting = [], ended

  function drain() {
    var l
    while(waiting.length && ((l = buffer.length) || ended)) {
      var data = buffer.shift()
      var cb   = cbs.shift()
      waiting.shift()(l ? null : ended, data)
      cb && cb(ended === true ? null : ended)
    }
  }

  function read (end, cb) {
    ended = ended || end
    waiting.push(cb)
    drain()
    if(ended)
      onClose && onClose(ended === true ? null : ended)
  }

  read.push = function (data, cb) {
    if(ended)
      return cb && cb(ended === true ? null : ended)
    buffer.push(data); cbs.push(cb)
    drain()
  }

  read.end = function (end, cb) {
    if('function' === typeof end)
      cb = end, end = true
    ended = ended || end || true;
    if(cb) cbs.push(cb)
    drain()
    if(ended)
      onClose && onClose(ended === true ? null : ended)
  }

  return read
})


},{"pull-stream":35}],35:[function(require,module,exports){

var sources  = require('./sources')
var sinks    = require('./sinks')
var throughs = require('./throughs')
var u        = require('pull-core')

for(var k in sources)
  exports[k] = u.Source(sources[k])

for(var k in throughs)
  exports[k] = u.Through(throughs[k])

for(var k in sinks)
  exports[k] = u.Sink(sinks[k])

var maybe = require('./maybe')(exports)

for(var k in maybe)
  exports[k] = maybe[k]

exports.Duplex  = 
exports.Through = exports.pipeable       = u.Through
exports.Source  = exports.pipeableSource = u.Source
exports.Sink    = exports.pipeableSink   = u.Sink



},{"./maybe":36,"./sinks":38,"./sources":39,"./throughs":40,"pull-core":37}],36:[function(require,module,exports){
var u = require('pull-core')
var prop = u.prop
var id   = u.id
var maybeSink = u.maybeSink

module.exports = function (pull) {

  var exports = {}
  var drain = pull.drain

  var find = 
  exports.find = function (test, cb) {
    return maybeSink(function (cb) {
      var ended = false
      if(!cb)
        cb = test, test = id
      else
        test = prop(test) || id

      return drain(function (data) {
        if(test(data)) {
          ended = true
          cb(null, data)
        return false
        }
      }, function (err) {
        if(ended) return //already called back
        cb(err === true ? null : err, null)
      })

    }, cb)
  }

  var reduce = exports.reduce = 
  function (reduce, acc, cb) {
    
    return maybeSink(function (cb) {
      return drain(function (data) {
        acc = reduce(acc, data)
      }, function (err) {
        cb(err, acc)
      })

    }, cb)
  }

  var collect = exports.collect = exports.writeArray =
  function (cb) {
    return reduce(function (arr, item) {
      arr.push(item)
      return arr
    }, [], cb)
  }

  return exports
}

},{"pull-core":37}],37:[function(require,module,exports){
exports.id = 
function (item) {
  return item
}

exports.prop = 
function (map) {  
  if('string' == typeof map) {
    var key = map
    return function (data) { return data[key] }
  }
  return map
}

exports.tester = function (test) {
  if(!test) return exports.id
  if('object' === typeof test
    && 'function' === typeof test.test)
      return test.test.bind(test)
  return exports.prop(test) || exports.id
}

exports.addPipe = addPipe

function addPipe(read) {
  if('function' !== typeof read)
    return read

  read.pipe = read.pipe || function (reader) {
    if('function' != typeof reader)
      throw new Error('must pipe to reader')
    return addPipe(reader(read))
  }
  read.type = 'Source'
  return read
}

var Source =
exports.Source =
function Source (createRead) {
  function s() {
    var args = [].slice.call(arguments)
    return addPipe(createRead.apply(null, args))
  }
  s.type = 'Source'
  return s
}


var Through =
exports.Through = 
function (createRead) {
  return function () {
    var args = [].slice.call(arguments)
    var piped = []
    function reader (read) {
      args.unshift(read)
      read = createRead.apply(null, args)
      while(piped.length)
        read = piped.shift()(read)
      return read
      //pipeing to from this reader should compose...
    }
    reader.pipe = function (read) {
      piped.push(read) 
      if(read.type === 'Source')
        throw new Error('cannot pipe ' + reader.type + ' to Source')
      reader.type = read.type === 'Sink' ? 'Sink' : 'Through'
      return reader
    }
    reader.type = 'Through'
    return reader
  }
}

var Sink =
exports.Sink = 
function Sink(createReader) {
  return function () {
    var args = [].slice.call(arguments)
    if(!createReader)
      throw new Error('must be createReader function')
    function s (read) {
      args.unshift(read)
      return createReader.apply(null, args)
    }
    s.type = 'Sink'
    return s
  }
}


exports.maybeSink = 
exports.maybeDrain = 
function (createSink, cb) {
  if(!cb)
    return Through(function (read) {
      var ended
      return function (close, cb) {
        if(close) return read(close, cb)
        if(ended) return cb(ended)

        createSink(function (err, data) {
          ended = err || true
          if(!err) cb(null, data)
          else     cb(ended)
        }) (read)
      }
    })()

  return Sink(function (read) {
    return createSink(cb) (read)
  })()
}


},{}],38:[function(require,module,exports){
var drain = exports.drain = function (read, op, done) {

  ;(function next() {
    var loop = true, cbed = false
    while(loop) {
      cbed = false
      read(null, function (end, data) {
        cbed = true
        if(end) {
          loop = false
          done && done(end === true ? null : end)
        }
        else if(op && false === op(data)) {
          loop = false
          read(true, done || function () {})
        }
        else if(!loop){
          next()
        }
      })
      if(!cbed) {
        loop = false
        return
      }
    }
  })()
}

var onEnd = exports.onEnd = function (read, done) {
  return drain(read, null, done)
}

var log = exports.log = function (read, done) {
  return drain(read, function (data) {
    console.log(data)
  }, done)
}


},{}],39:[function(require,module,exports){

var keys = exports.keys =
function (object) {
  return values(Object.keys(object))
}

var once = exports.once =
function (value) {
  return function (abort, cb) {
    if(abort) return cb(abort)
    if(value != null) {
      var _value = value; value = null
      cb(null, _value)
    } else
      cb(true)
  }
}

var values = exports.values = exports.readArray =
function (array) {
  if(!Array.isArray(array))
    array = Object.keys(array).map(function (k) {
      return array[k]
    })
  var i = 0
  return function (end, cb) {
    if(end)
      return cb && cb(end)  
    cb(i >= array.length || null, array[i++])
  }
}


var count = exports.count = 
function (max) {
  var i = 0; max = max || Infinity
  return function (end, cb) {
    if(end) return cb && cb(end)
    if(i > max)
      return cb(true)
    cb(null, i++)
  }
}

var infinite = exports.infinite = 
function (generate) {
  generate = generate || Math.random
  return function (end, cb) {
    if(end) return cb && cb(end)
    return cb(null, generate())
  }
}

var defer = exports.defer = function () {
  var _read, cbs = [], _end

  var read = function (end, cb) {
    if(!_read) {
      _end = end
      cbs.push(cb)
    } 
    else _read(end, cb)
  }
  read.resolve = function (read) {
    if(_read) throw new Error('already resolved')
    _read = read
    if(!_read) throw new Error('no read cannot resolve!' + _read)
    while(cbs.length)
      _read(_end, cbs.shift())
  }
  read.abort = function(err) {
    read.resolve(function (_, cb) {
      cb(err || true)
    })
  }
  return read
}

var empty = exports.empty = function () {
  return function (abort, cb) {
    cb(true)
  }
}

var depthFirst = exports.depthFirst =
function (start, createStream) {
  var reads = []

  reads.unshift(once(start))

  return function next (end, cb) {
    if(!reads.length)
      return cb(true)
    reads[0](end, function (end, data) {
      if(end) {
        //if this stream has ended, go to the next queue
        reads.shift()
        return next(null, cb)
      }
      reads.unshift(createStream(data))
      cb(end, data)
    })
  }
}
//width first is just like depth first,
//but push each new stream onto the end of the queue
var widthFirst = exports.widthFirst = 
function (start, createStream) {
  var reads = []

  reads.push(once(start))

  return function next (end, cb) {
    if(!reads.length)
      return cb(true)
    reads[0](end, function (end, data) {
      if(end) {
        reads.shift()
        return next(null, cb)
      }
      reads.push(createStream(data))
      cb(end, data)
    })
  }
}

//this came out different to the first (strm)
//attempt at leafFirst, but it's still a valid
//topological sort.
var leafFirst = exports.leafFirst = 
function (start, createStream) {
  var reads = []
  var output = []
  reads.push(once(start))
  
  return function next (end, cb) {
    reads[0](end, function (end, data) {
      if(end) {
        reads.shift()
        if(!output.length)
          return cb(true)
        return cb(null, output.shift())
      }
      reads.unshift(createStream(data))
      output.unshift(data)
      next(null, cb)
    })
  }
}


},{}],40:[function(require,module,exports){
(function (process){
var u      = require('pull-core')
var sources = require('./sources')
var sinks = require('./sinks')

var prop   = u.prop
var id     = u.id
var tester = u.tester

var map = exports.map = 
function (read, map) {
  map = prop(map) || id
  return function (end, cb) {
    read(end, function (end, data) {
      var data = !end ? map(data) : null
      cb(end, data)
    })
  }
}

var asyncMap = exports.asyncMap =
function (read, map) {
  if(!map) return read
  return function (end, cb) {
    if(end) return read(end, cb) //abort
    read(null, function (end, data) {
      if(end) return cb(end, data)
      map(data, cb)
    })
  }
}

var paraMap = exports.paraMap =
function (read, map, width) {
  if(!map) return read
  var ended = false, queue = [], _cb

  function drain () {
    if(!_cb) return
    var cb = _cb
    _cb = null
    if(queue.length)
      return cb(null, queue.shift())
    else if(ended && !n)
      return cb(ended)
    _cb = cb
  }

  function pull () {
    read(null, function (end, data) {
      if(end) {
        ended = end
        return drain()
      }
      n++
      map(data, function (err, data) {
        n--

        queue.push(data)
        drain()
      })

      if(n < width && !ended)
        pull()
    })
  }

  var n = 0
  return function (end, cb) {
    if(end) return read(end, cb) //abort
    //continue to read while there are less than 3 maps in flight
    _cb = cb
    if(queue.length || ended)
      pull(), drain()
    else pull()
  }
  return highWaterMark(asyncMap(read, map), width)
}

var filter = exports.filter =
function (read, test) {
  //regexp
  test = tester(test)
  return function next (end, cb) {
    read(end, function (end, data) {
      if(!end && !test(data))
        return next(end, cb)
      cb(end, data)
    })
  }
}

var filterNot = exports.filterNot =
function (read, test) {
  test = tester(test)
  return filter(read, function (e) {
    return !test(e)
  })
}

var through = exports.through = 
function (read, op, onEnd) {
  var a = false
  function once (abort) {
    if(a || !onEnd) return
    a = true
    onEnd(abort === true ? null : abort)
  }

  return function (end, cb) {
    if(end) once(end)
    return read(end, function (end, data) {
      if(!end) op && op(data)
      else once(end)
      cb(end, data)
    })
  }
}

var take = exports.take =
function (read, test) {
  var ended = false
  if('number' === typeof test) {
    var n = test; test = function () {
      return n --
    }
  }

  return function (end, cb) {
    if(ended) return cb(ended)
    if(ended = end) return read(ended, cb)

    read(null, function (end, data) {
      if(ended = ended || end) return cb(ended)
      if(!test(data)) {
        ended = true
        read(true, function (end, data) {
          cb(ended, data)
        })
      }
      else
        cb(null, data)
    })
  }
}

var unique = exports.unique = function (read, field, invert) {
  field = prop(field) || id
  var seen = {}
  return filter(read, function (data) {
    var key = field(data)
    if(seen[key]) return !!invert //false, by default
    else seen[key] = true
    return !invert //true by default
  })
}

var nonUnique = exports.nonUnique = function (read, field) {
  return unique(read, field, true)
}

var group = exports.group =
function (read, size) {
  var ended; size = size || 5
  var queue = []

  return function (end, cb) {
    //this means that the upstream is sending an error.
    if(end) return read(ended = end, cb)
    //this means that we read an end before.
    if(ended) return cb(ended)

    read(null, function next(end, data) {
      if(ended = ended || end) {
        if(!queue.length)
          return cb(ended)

        var _queue = queue; queue = []
        return cb(null, _queue)
      }
      queue.push(data)
      if(queue.length < size)
        return read(null, next)

      var _queue = queue; queue = []
      cb(null, _queue)
    })
  }
}

var flatten = exports.flatten = function (read) {
  var _read
  return function (abort, cb) {
    if(_read) nextChunk()
    else      nextStream()

    function nextChunk () {
      _read(null, function (end, data) {
        if(end) nextStream()
        else    cb(null, data)
      })
    }
    function nextStream () {
      read(null, function (end, stream) {
        if(end)
          return cb(end)
        if(Array.isArray(stream))
          stream = sources.values(stream)
        else if('function' != typeof stream)
          throw new Error('expected stream of streams')
        
        _read = stream
        nextChunk()
      })
    }
  }
}

var prepend =
exports.prepend =
function (read, head) {

  return function (abort, cb) {
    if(head !== null) {
      if(abort)
        return read(abort, cb)
      var _head = head
      head = null
      cb(null, _head)
    } else {
      read(abort, cb)
    }
  }

}

//var drainIf = exports.drainIf = function (op, done) {
//  sinks.drain(
//}

var _reduce = exports._reduce = function (read, reduce, initial) {
  return function (close, cb) {
    if(close) return read(close, cb)
    if(ended) return cb(ended)

    sinks.drain(function (item) {
      initial = reduce(initial, item)
    }, function (err, data) {
      ended = err || true
      if(!err) cb(null, initial)
      else     cb(ended)
    })
    (read)
  }
}

var nextTick = process.nextTick

var highWaterMark = exports.highWaterMark = 
function (read, highWaterMark) {
  var buffer = [], waiting = [], ended, reading = false
  highWaterMark = highWaterMark || 10

  function readAhead () {
    while(waiting.length && (buffer.length || ended))
      waiting.shift()(ended, ended ? null : buffer.shift())
  }

  function next () {
    if(ended || reading || buffer.length >= highWaterMark)
      return
    reading = true
    return read(ended, function (end, data) {
      reading = false
      ended = ended || end
      if(data != null) buffer.push(data)
      
      next(); readAhead()
    })
  }

  nextTick(next)

  return function (end, cb) {
    ended = ended || end
    waiting.push(cb)

    next(); readAhead()
  }
}




}).call(this,require('_process'))
},{"./sinks":38,"./sources":39,"_process":94,"pull-core":37}],41:[function(require,module,exports){
var sources  = require('./sources')
var sinks    = require('./sinks')
var throughs = require('./throughs')
var u        = require('pull-core')

function isFunction (fun) {
  return 'function' === typeof fun
}

function isReader (fun) {
  return fun && (fun.type === "Through" || fun.length === 1)
}
var exports = module.exports = function pull () {
  var args = [].slice.call(arguments)

  if(isReader(args[0]))
    return function (read) {
      args.unshift(read)
      return pull.apply(null, args)
    }

  var read = args.shift()

  //if the first function is a duplex stream,
  //pipe from the source.
  if(isFunction(read.source))
    read = read.source

  function next () {
    var s = args.shift()

    if(null == s)
      return next()

    if(isFunction(s)) return s

    return function (read) {
      s.sink(read)
      //this supports pipeing through a duplex stream
      //pull(a, b, a) "telephone style".
      //if this stream is in the a (first & last position)
      //s.source will have already been used, but this should never be called
      //so that is okay.
      return s.source
    }
  }

  while(args.length)
    read = next() (read)

  return read
}


for(var k in sources)
  exports[k] = u.Source(sources[k])

for(var k in throughs)
  exports[k] = u.Through(throughs[k])

for(var k in sinks)
  exports[k] = u.Sink(sinks[k])

var maybe = require('./maybe')(exports)

for(var k in maybe)
  exports[k] = maybe[k]

exports.Duplex  = 
exports.Through = exports.pipeable       = u.Through
exports.Source  = exports.pipeableSource = u.Source
exports.Sink    = exports.pipeableSink   = u.Sink



},{"./maybe":42,"./sinks":44,"./sources":45,"./throughs":46,"pull-core":43}],42:[function(require,module,exports){
var u = require('pull-core')
var prop = u.prop
var id   = u.id
var maybeSink = u.maybeSink

module.exports = function (pull) {

  var exports = {}
  var drain = pull.drain

  var find =
  exports.find = function (test, cb) {
    return maybeSink(function (cb) {
      var ended = false
      if(!cb)
        cb = test, test = id
      else
        test = prop(test) || id

      return drain(function (data) {
        if(test(data)) {
          ended = true
          cb(null, data)
        return false
        }
      }, function (err) {
        if(ended) return //already called back
        cb(err === true ? null : err, null)
      })

    }, cb)
  }

  var reduce = exports.reduce =
  function (reduce, acc, cb) {

    return maybeSink(function (cb) {
      return drain(function (data) {
        acc = reduce(acc, data)
      }, function (err) {
        cb(err, acc)
      })

    }, cb)
  }

  var collect = exports.collect = exports.writeArray =
  function (cb) {
    return reduce(function (arr, item) {
      arr.push(item)
      return arr
    }, [], cb)
  }

  var concat = exports.concat =
  function (cb) {
    return reduce(function (a, b) {
      return a + b
    }, '', cb)
  }

  return exports
}

},{"pull-core":43}],43:[function(require,module,exports){
exports.id = 
function (item) {
  return item
}

exports.prop = 
function (map) {  
  if('string' == typeof map) {
    var key = map
    return function (data) { return data[key] }
  }
  return map
}

exports.tester = function (test) {
  if(!test) return exports.id
  if('object' === typeof test
    && 'function' === typeof test.test)
      return test.test.bind(test)
  return exports.prop(test) || exports.id
}

exports.addPipe = addPipe

function addPipe(read) {
  if('function' !== typeof read)
    return read

  read.pipe = read.pipe || function (reader) {
    if('function' != typeof reader && 'function' != typeof reader.sink)
      throw new Error('must pipe to reader')
    var pipe = addPipe(reader.sink ? reader.sink(read) : reader(read))
    return reader.source || pipe;
  }
  
  read.type = 'Source'
  return read
}

var Source =
exports.Source =
function Source (createRead) {
  function s() {
    var args = [].slice.call(arguments)
    return addPipe(createRead.apply(null, args))
  }
  s.type = 'Source'
  return s
}


var Through =
exports.Through = 
function (createRead) {
  return function () {
    var args = [].slice.call(arguments)
    var piped = []
    function reader (read) {
      args.unshift(read)
      read = createRead.apply(null, args)
      while(piped.length)
        read = piped.shift()(read)
      return read
      //pipeing to from this reader should compose...
    }
    reader.pipe = function (read) {
      piped.push(read) 
      if(read.type === 'Source')
        throw new Error('cannot pipe ' + reader.type + ' to Source')
      reader.type = read.type === 'Sink' ? 'Sink' : 'Through'
      return reader
    }
    reader.type = 'Through'
    return reader
  }
}

var Sink =
exports.Sink = 
function Sink(createReader) {
  return function () {
    var args = [].slice.call(arguments)
    if(!createReader)
      throw new Error('must be createReader function')
    function s (read) {
      args.unshift(read)
      return createReader.apply(null, args)
    }
    s.type = 'Sink'
    return s
  }
}


exports.maybeSink = 
exports.maybeDrain = 
function (createSink, cb) {
  if(!cb)
    return Through(function (read) {
      var ended
      return function (close, cb) {
        if(close) return read(close, cb)
        if(ended) return cb(ended)

        createSink(function (err, data) {
          ended = err || true
          if(!err) cb(null, data)
          else     cb(ended)
        }) (read)
      }
    })()

  return Sink(function (read) {
    return createSink(cb) (read)
  })()
}


},{}],44:[function(require,module,exports){
var drain = exports.drain = function (read, op, done) {

  ;(function next() {
    var loop = true, cbed = false
    while(loop) {
      cbed = false
      read(null, function (end, data) {
        cbed = true
        if(end) {
          loop = false
          if(done) done(end === true ? null : end)
          else if(end && end !== true)
            throw end
        }
        else if(op && false === op(data)) {
          loop = false
          read(true, done || function () {})
        }
        else if(!loop){
          next()
        }
      })
      if(!cbed) {
        loop = false
        return
      }
    }
  })()
}

var onEnd = exports.onEnd = function (read, done) {
  return drain(read, null, done)
}

var log = exports.log = function (read, done) {
  return drain(read, function (data) {
    console.log(data)
  }, done)
}


},{}],45:[function(require,module,exports){

var keys = exports.keys =
function (object) {
  return values(Object.keys(object))
}

function abortCb(cb, abort, onAbort) {
  cb(abort)
  onAbort && onAbort(abort === true ? null: abort)
  return
}

var once = exports.once =
function (value, onAbort) {
  return function (abort, cb) {
    if(abort)
      return abortCb(cb, abort, onAbort)
    if(value != null) {
      var _value = value; value = null
      cb(null, _value)
    } else
      cb(true)
  }
}

var values = exports.values = exports.readArray =
function (array, onAbort) {
  if(!array)
    return function (abort, cb) {
      if(abort) return abortCb(cb, abort, onAbort)
      return cb(true)
    }
  if(!Array.isArray(array))
    array = Object.keys(array).map(function (k) {
      return array[k]
    })
  var i = 0
  return function (abort, cb) {
    if(abort)
      return abortCb(cb, abort, onAbort)
    cb(i >= array.length || null, array[i++])
  }
}


var count = exports.count =
function (max) {
  var i = 0; max = max || Infinity
  return function (end, cb) {
    if(end) return cb && cb(end)
    if(i > max)
      return cb(true)
    cb(null, i++)
  }
}

var infinite = exports.infinite =
function (generate) {
  generate = generate || Math.random
  return function (end, cb) {
    if(end) return cb && cb(end)
    return cb(null, generate())
  }
}

var defer = exports.defer = function () {
  var _read, cbs = [], _end

  var read = function (end, cb) {
    if(!_read) {
      _end = end
      cbs.push(cb)
    } 
    else _read(end, cb)
  }
  read.resolve = function (read) {
    if(_read) throw new Error('already resolved')
    _read = read
    if(!_read) throw new Error('no read cannot resolve!' + _read)
    while(cbs.length)
      _read(_end, cbs.shift())
  }
  read.abort = function(err) {
    read.resolve(function (_, cb) {
      cb(err || true)
    })
  }
  return read
}

var empty = exports.empty = function () {
  return function (abort, cb) {
    cb(true)
  }
}

var error = exports.error = function (err) {
  return function (abort, cb) {
    cb(err)
  }
}

var depthFirst = exports.depthFirst =
function (start, createStream) {
  var reads = []

  reads.unshift(once(start))

  return function next (end, cb) {
    if(!reads.length)
      return cb(true)
    reads[0](end, function (end, data) {
      if(end) {
        //if this stream has ended, go to the next queue
        reads.shift()
        return next(null, cb)
      }
      reads.unshift(createStream(data))
      cb(end, data)
    })
  }
}
//width first is just like depth first,
//but push each new stream onto the end of the queue
var widthFirst = exports.widthFirst =
function (start, createStream) {
  var reads = []

  reads.push(once(start))

  return function next (end, cb) {
    if(!reads.length)
      return cb(true)
    reads[0](end, function (end, data) {
      if(end) {
        reads.shift()
        return next(null, cb)
      }
      reads.push(createStream(data))
      cb(end, data)
    })
  }
}

//this came out different to the first (strm)
//attempt at leafFirst, but it's still a valid
//topological sort.
var leafFirst = exports.leafFirst =
function (start, createStream) {
  var reads = []
  var output = []
  reads.push(once(start))

  return function next (end, cb) {
    reads[0](end, function (end, data) {
      if(end) {
        reads.shift()
        if(!output.length)
          return cb(true)
        return cb(null, output.shift())
      }
      reads.unshift(createStream(data))
      output.unshift(data)
      next(null, cb)
    })
  }
}


},{}],46:[function(require,module,exports){
(function (process){
var u      = require('pull-core')
var sources = require('./sources')
var sinks = require('./sinks')

var prop   = u.prop
var id     = u.id
var tester = u.tester

var map = exports.map =
function (read, map) {
  map = prop(map) || id
  return function (abort, cb) {
    read(abort, function (end, data) {
      try {
      data = !end ? map(data) : null
      } catch (err) {
        return read(err, function () {
          return cb(err)
        })
      }
      cb(end, data)
    })
  }
}

var asyncMap = exports.asyncMap =
function (read, map) {
  if(!map) return read
  return function (end, cb) {
    if(end) return read(end, cb) //abort
    read(null, function (end, data) {
      if(end) return cb(end, data)
      map(data, cb)
    })
  }
}

var paraMap = exports.paraMap =
function (read, map, width) {
  if(!map) return read
  var ended = false, queue = [], _cb

  function drain () {
    if(!_cb) return
    var cb = _cb
    _cb = null
    if(queue.length)
      return cb(null, queue.shift())
    else if(ended && !n)
      return cb(ended)
    _cb = cb
  }

  function pull () {
    read(null, function (end, data) {
      if(end) {
        ended = end
        return drain()
      }
      n++
      map(data, function (err, data) {
        n--

        queue.push(data)
        drain()
      })

      if(n < width && !ended)
        pull()
    })
  }

  var n = 0
  return function (end, cb) {
    if(end) return read(end, cb) //abort
    //continue to read while there are less than 3 maps in flight
    _cb = cb
    if(queue.length || ended)
      pull(), drain()
    else pull()
  }
  return highWaterMark(asyncMap(read, map), width)
}

var filter = exports.filter =
function (read, test) {
  //regexp
  test = tester(test)
  return function next (end, cb) {
    var sync, loop = true
    while(loop) {
      loop = false
      sync = true
      read(end, function (end, data) {
        if(!end && !test(data))
          return sync ? loop = true : next(end, cb)
        cb(end, data)
      })
      sync = false
    }
  }
}

var filterNot = exports.filterNot =
function (read, test) {
  test = tester(test)
  return filter(read, function (e) {
    return !test(e)
  })
}

var through = exports.through =
function (read, op, onEnd) {
  var a = false
  function once (abort) {
    if(a || !onEnd) return
    a = true
    onEnd(abort === true ? null : abort)
  }

  return function (end, cb) {
    if(end) once(end)
    return read(end, function (end, data) {
      if(!end) op && op(data)
      else once(end)
      cb(end, data)
    })
  }
}

var take = exports.take =
function (read, test, opts) {
  opts = opts || {}
  var last = opts.last || false // whether the first item for which !test(item) should still pass
  var ended = false
  if('number' === typeof test) {
    last = true
    var n = test; test = function () {
      return --n
    }
  }

  function terminate (cb) {
    read(true, function (err) {
      last = false; cb(err || true)
    })
  }

  return function (end, cb) {
    if(ended)            last ? terminate(cb) : cb(ended)
    else if(ended = end) read(ended, cb)
    else
      read(null, function (end, data) {
        if(ended = ended || end) {
          //last ? terminate(cb) :
          cb(ended)
        }
        else if(!test(data)) {
          ended = true
          last ? cb(null, data) : terminate(cb)
        }
        else
          cb(null, data)
      })
  }
}

var unique = exports.unique = function (read, field, invert) {
  field = prop(field) || id
  var seen = {}
  return filter(read, function (data) {
    var key = field(data)
    if(seen[key]) return !!invert //false, by default
    else seen[key] = true
    return !invert //true by default
  })
}

var nonUnique = exports.nonUnique = function (read, field) {
  return unique(read, field, true)
}

var group = exports.group =
function (read, size) {
  var ended; size = size || 5
  var queue = []

  return function (end, cb) {
    //this means that the upstream is sending an error.
    if(end) return read(ended = end, cb)
    //this means that we read an end before.
    if(ended) return cb(ended)

    read(null, function next(end, data) {
      if(ended = ended || end) {
        if(!queue.length)
          return cb(ended)

        var _queue = queue; queue = []
        return cb(null, _queue)
      }
      queue.push(data)
      if(queue.length < size)
        return read(null, next)

      var _queue = queue; queue = []
      cb(null, _queue)
    })
  }
}

var flatten = exports.flatten = function (read) {
  var _read
  return function (abort, cb) {
    if (abort) {
      _read ? _read(abort, function(err) {
        read(err || abort, cb)
      }) : read(abort, cb)
    }
    else if(_read) nextChunk()
    else nextStream()

    function nextChunk () {
      _read(null, function (err, data) {
        if (err === true) nextStream()
        else if (err) {
          read(true, function(abortErr) {
            // TODO: what do we do with the abortErr?
            cb(err)
          })
        }
        else cb(null, data)
      })
    }
    function nextStream () {
      read(null, function (end, stream) {
        if(end)
          return cb(end)
        if(Array.isArray(stream) || stream && 'object' === typeof stream)
          stream = sources.values(stream)
        else if('function' != typeof stream)
          throw new Error('expected stream of streams')
        _read = stream
        nextChunk()
      })
    }
  }
}

var prepend =
exports.prepend =
function (read, head) {

  return function (abort, cb) {
    if(head !== null) {
      if(abort)
        return read(abort, cb)
      var _head = head
      head = null
      cb(null, _head)
    } else {
      read(abort, cb)
    }
  }

}

//var drainIf = exports.drainIf = function (op, done) {
//  sinks.drain(
//}

var _reduce = exports._reduce = function (read, reduce, initial) {
  return function (close, cb) {
    if(close) return read(close, cb)
    if(ended) return cb(ended)

    sinks.drain(function (item) {
      initial = reduce(initial, item)
    }, function (err, data) {
      ended = err || true
      if(!err) cb(null, initial)
      else     cb(ended)
    })
    (read)
  }
}

var nextTick = process.nextTick

var highWaterMark = exports.highWaterMark =
function (read, highWaterMark) {
  var buffer = [], waiting = [], ended, ending, reading = false
  highWaterMark = highWaterMark || 10

  function readAhead () {
    while(waiting.length && (buffer.length || ended))
      waiting.shift()(ended, ended ? null : buffer.shift())

    if (!buffer.length && ending) ended = ending;
  }

  function next () {
    if(ended || ending || reading || buffer.length >= highWaterMark)
      return
    reading = true
    return read(ended || ending, function (end, data) {
      reading = false
      ending = ending || end
      if(data != null) buffer.push(data)

      next(); readAhead()
    })
  }

  process.nextTick(next)

  return function (end, cb) {
    ended = ended || end
    waiting.push(cb)

    next(); readAhead()
  }
}

var flatMap = exports.flatMap =
function (read, mapper) {
  mapper = mapper || id
  var queue = [], ended

  return function (abort, cb) {
    if(queue.length) return cb(null, queue.shift())
    else if(ended)   return cb(ended)

    read(abort, function next (end, data) {
      if(end) ended = end
      else {
        var add = mapper(data)
        while(add && add.length)
          queue.push(add.shift())
      }

      if(queue.length) cb(null, queue.shift())
      else if(ended)   cb(ended)
      else             read(null, next)
    })
  }
}


}).call(this,require('_process'))
},{"./sinks":44,"./sources":45,"_process":94,"pull-core":43}],47:[function(require,module,exports){
var extend = require('cog/extend');

module.exports = function(signaller) {

  function dataAllowed(data) {
    var cloned = extend({ allow: true }, data);
    signaller('peer:filter', data.id, cloned);

    return cloned.allow;
  }

  return function(args, messageType, srcData, srcState, isDM) {
    var data = args[0];
    var peer;

    // if we have valid data then process
    if (data && data.id && data.id !== signaller.id) {
      if (! dataAllowed(data)) {
        return;
      }
      // check to see if this is a known peer
      peer = signaller.peers.get(data.id);

      // trigger the peer connected event to flag that we know about a
      // peer connection. The peer has passed the "filter" check but may
      // be announced / updated depending on previous connection status
      signaller('peer:connected', data.id, data);

      // if the peer is existing, then update the data
      if (peer) {
        // update the data
        extend(peer.data, data);

        // trigger the peer update event
        return signaller('peer:update', data, srcData);
      }

      // create a new peer
      peer = {
        id: data.id,

        // initialise the local role index
        roleIdx: [data.id, signaller.id].sort().indexOf(data.id),

        // initialise the peer data
        data: {}
      };

      // initialise the peer data
      extend(peer.data, data);

      // set the peer data
      signaller.peers.set(data.id, peer);

      // if this is an initial announce message (no vector clock attached)
      // then send a announce reply
      if (signaller.autoreply && (! isDM)) {
        signaller
          .to(data.id)
          .send('/announce', signaller.attributes);
      }

      // emit a new peer announce event
      return signaller('peer:announce', data, peer);
    }
  };
};

},{"cog/extend":21}],48:[function(require,module,exports){
/**
  ### prepare

  ```
  fn(args) => String
  ```

  Convert an array of values into a pipe-delimited string.

**/
module.exports = function(args) {
  return args.map(prepareArg).join('|');
};

function prepareArg(arg) {
  if (typeof arg == 'object' && (! (arg instanceof String))) {
    return JSON.stringify(arg);
  }
  else if (typeof arg == 'function') {
    return null;
  }

  return arg;
}

},{}],49:[function(require,module,exports){
var jsonparse = require('cog/jsonparse');

/**
  ### process

  ```
  fn(signaller, opts) => fn(message)
  ```

  The core processing logic that is used to respond to incoming signaling
  messages.

**/
module.exports = function(signaller, opts) {
  var handlers = {
    announce: require('./handlers/announce')(signaller, opts)
  };

  function sendEvent(parts, srcState, data) {
    // initialise the event name
    var evtName = 'message:' + parts[0].slice(1);

    // convert any valid json objects to json
    var args = parts.slice(2).map(jsonparse);

    signaller.apply(
      signaller,
      [evtName].concat(args).concat([srcState, data])
    );
  }

  return function(originalData) {
    var data = originalData;
    var isMatch = true;
    var parts;
    var handler;
    var srcData;
    var srcState;
    var isDirectMessage = false;

    // discard primus messages
    if (data && data.slice(0, 6) === 'primus') {
      return;
    }

    // force the id into string format so we can run length and comparison tests on it
    var id = signaller.id + '';

    // process /to messages
    if (data.slice(0, 3) === '/to') {
      isMatch = data.slice(4, id.length + 4) === id;
      if (isMatch) {
        parts = data.slice(5 + id.length).split('|').map(jsonparse);

        // get the source data
        isDirectMessage = true;

        // extract the vector clock and update the parts
        parts = parts.map(jsonparse);
      }
    }

    // if this is not a match, then bail
    if (! isMatch) {
      return;
    }

    // chop the data into parts
    signaller('rawdata', data);
    parts = parts || data.split('|').map(jsonparse);

    // if we have a specific handler for the action, then invoke
    if (typeof parts[0] == 'string') {
      // extract the metadata from the input data
      srcData = parts[1];

      // if we got data from ourself, then this is pretty dumb
      // but if we have then throw it away
      if (srcData === signaller.id) {
        return console.warn('got data from ourself, discarding');
      }

      // get the source state
      srcState = signaller.peers.get(srcData) || srcData;

      // handle commands
      if (parts[0].charAt(0) === '/') {
        // look for a handler for the message type
        handler = handlers[parts[0].slice(1)];

        if (typeof handler == 'function') {
          handler(
            parts.slice(2),
            parts[0].slice(1),
            srcData,
            srcState,
            isDirectMessage
          );
        }
        else {
          sendEvent(parts, srcState, originalData);
        }
      }
      // otherwise, emit data
      else {
        signaller(
          'data',
          parts.slice(0, 1).concat(parts.slice(2)),
          srcData,
          srcState,
          isDirectMessage
        );
      }
    }
  };
};

},{"./handlers/announce":47,"cog/jsonparse":23}],50:[function(require,module,exports){
var detect = require('rtc-core/detect');
var extend = require('cog/extend');
var getable = require('cog/getable');
var cuid = require('cuid');
var mbus = require('mbus');
var prepare = require('./prepare');

/**
  ## `signaller(opts, bufferMessage) => mbus`

  Create a base level signaller which is capable of processing
  messages from an incoming source.  The signaller is capable of
  sending messages outbound using the `bufferMessage` function
  that is supplied to the signaller.

**/
module.exports = function(opts, bufferMessage) {
  // get the autoreply setting
  var autoreply = (opts || {}).autoreply;

  // create the signaller mbus
  var signaller = mbus('', (opts || {}).logger);

  // initialise the peers
  var peers = signaller.peers = getable({});

  // initialise the signaller attributes
  var attributes = signaller.attributes = {
    browser: detect.browser,
    browserVersion: detect.browserVersion,
    agent: 'unknown'
  };

  function createToMessage(header) {
    return function() {
      var args = header.concat([].slice.call(arguments));

      // inject the signaller.id
      args.splice(3, 0, signaller.id);
      bufferMessage(prepare(args));
    }
  }

  // initialise the signaller id
  signaller.id = (opts || {}).id || cuid();

  /**
    #### `isMaster(targetId) => Boolean`

    A simple function that indicates whether the local signaller is the master
    for it's relationship with peer signaller indicated by `targetId`.  Roles
    are determined at the point at which signalling peers discover each other,
    and are simply worked out by whichever peer has the lowest signaller id
    when lexigraphically sorted.

    For example, if we have two signaller peers that have discovered each
    others with the following ids:

    - `b11f4fd0-feb5-447c-80c8-c51d8c3cced2`
    - `8a07f82e-49a5-4b9b-a02e-43d911382be6`

    They would be assigned roles:

    - `b11f4fd0-feb5-447c-80c8-c51d8c3cced2`
    - `8a07f82e-49a5-4b9b-a02e-43d911382be6` (master)

  **/
  signaller.isMaster = function(targetId) {
    var peer = peers.get(targetId);

    return peer && peer.roleIdx !== 0;
  };

  /**
    #### `send(args*)`

    Prepare a message for sending, e.g.:

    ```js
    signaller.send('/foo', 'bar');
    ```

  **/
  signaller.send = function() {
    var args = [].slice.call(arguments);

    // inject the metadata
    args.splice(1, 0, signaller.id);

    // send the message
    bufferMessage(prepare(args));
  };


  /**
    #### `to(targetId)`

    Use the `to` function to send a message to the specified target peer.
    A large parge of negotiating a WebRTC peer connection involves direct
    communication between two parties which must be done by the signalling
    server.  The `to` function provides a simple way to provide a logical
    communication channel between the two parties:

    ```js
    var send = signaller.to('e95fa05b-9062-45c6-bfa2-5055bf6625f4').send;

    // create an offer on a local peer connection
    pc.createOffer(
      function(desc) {
        // set the local description using the offer sdp
        // if this occurs successfully send this to our peer
        pc.setLocalDescription(
          desc,
          function() {
            send('/sdp', desc);
          },
          handleFail
        );
      },
      handleFail
    );
    ```

  **/
  signaller.to = function(targetId) {
    return {
      send: createToMessage(['/to', targetId])
    };
  };

  /**
    ### Signaller Internals

    The following functions are designed for use by signallers that are built
    on top of this base signaller.
  **/

  /**
    #### `_announce()`

    The internal function that constructs the `/announce` message and triggers
    the `local:announce` event.

  **/
  signaller._announce = function() {
    signaller.send('/announce', attributes);
    signaller('local:announce', attributes);
  };

  /**
    #### `_process(data)`


  **/
  signaller._process = require('./process')(signaller);

  /**
    #### `_update`

    Internal function that updates core announce attributes with
    updated data.

**/
  signaller._update = function(data) {
    extend(attributes, data, { id: signaller.id });
  };

  // set the autoreply flag
  signaller.autoreply = autoreply === undefined || autoreply;

  return signaller;
};

},{"./prepare":48,"./process":49,"cog/extend":21,"cog/getable":22,"cuid":33,"mbus":26,"rtc-core/detect":27}],51:[function(require,module,exports){
var extend = require('cog/extend');

/**
  # rtc-switchboard-messenger

  A specialised version of
  [`messenger-ws`](https://github.com/DamonOehlman/messenger-ws) designed to
  connect to [`rtc-switchboard`](http://github.com/rtc-io/rtc-switchboard)
  instances.

**/
module.exports = function(switchboard, opts) {
  return require('messenger-ws')(switchboard, extend({
    endpoints: (opts || {}).endpoints || ['/']
  }, opts));
};

},{"cog/extend":21,"messenger-ws":52}],52:[function(require,module,exports){
var WebSocket = require('ws');
var wsurl = require('wsurl');
var ps = require('pull-ws');
var defaults = require('cog/defaults');
var reTrailingSlash = /\/$/;
var DEFAULT_FAILCODES = [];

/**
  # messenger-ws

  This is a simple messaging implementation for sending and receiving data
  via websockets.

  Follows the [messenger-archetype](https://github.com/DamonOehlman/messenger-archetype)

  ## Example Usage

  <<< examples/simple.js

**/
module.exports = function(url, opts) {
  var timeout = (opts || {}).timeout || 1000;
  var failcodes = (opts || {}).failcodes || DEFAULT_FAILCODES;
  var endpoints = ((opts || {}).endpoints || ['/']).map(function(endpoint) {
    return url.replace(reTrailingSlash, '') + endpoint;
  });

  function connect(callback) {
    var queue = [].concat(endpoints);
    var isConnected = false;
    var socket;
    var failTimer;
    var successTimer;
    var removeListener;
    var source;

    function attemptNext() {
      // if we have already connected, do nothing
      // NOTE: workaround for websockets/ws#489
      if (isConnected) {
        return;
      }

      // if we have no more valid endpoints, then erorr out
      if (queue.length === 0) {
        return callback(new Error('Unable to connect to url: ' + url));
      }

      socket = new WebSocket(wsurl(queue.shift()));
      socket.addEventListener('message', connect);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);
      socket.addEventListener('open', handleOpen);

      removeListener = socket.removeEventListener || socket.removeListener;
      failTimer = setTimeout(attemptNext, timeout);
    }

    function connect() {
      // if we are already connected, abort
      // NOTE: workaround for websockets/ws#489
      if (isConnected) {
        return;
      }

      // clear any monitors
      clearTimeout(failTimer);
      clearTimeout(successTimer);

      // remove the close and error listeners as messenger-ws has done
      // what it set out to do and that is create a connection
      // NOTE: issue websockets/ws#489 causes means this fails in ws
      removeListener.call(socket, 'open', handleOpen);
      removeListener.call(socket, 'close', handleClose);
      removeListener.call(socket, 'error', handleError);
      removeListener.call(socket, 'message', connect);

      // trigger the callback
      isConnected = true;
      callback(null, source, ps.sink(socket, opts));
    }

    function handleClose(evt) {
      var clean = evt.wasClean && (
        evt.code === undefined || failcodes.indexOf(evt.code) < 0
      );

      // if this was not a clean close, then handle error
      if (! clean) {
        return handleError();
      }

      clearTimeout(successTimer);
      clearTimeout(failTimer);
    }

    function handleError() {
      clearTimeout(successTimer);
      clearTimeout(failTimer);
      attemptNext();
    }

    function handleOpen() {
      // create the source immediately to buffer any data
      source = ps.source(socket, opts);

      // monitor data flowing from the socket
      successTimer = setTimeout(connect, 100);
    }

    attemptNext();
  }

  return connect;
};

},{"cog/defaults":20,"pull-ws":53,"ws":58,"wsurl":59}],53:[function(require,module,exports){
exports = module.exports = duplex;

exports.source = require('./source');
exports.sink = require('./sink');

function duplex (ws, opts) {
  return {
    source: exports.source(ws),
    sink: exports.sink(ws, opts)
  };
};

},{"./sink":56,"./source":57}],54:[function(require,module,exports){
arguments[4][43][0].apply(exports,arguments)
},{"dup":43}],55:[function(require,module,exports){
module.exports = function(socket, callback) {
  var remove = socket && (socket.removeEventListener || socket.removeListener);

  function cleanup () {
    if (typeof remove == 'function') {
      remove.call(socket, 'open', handleOpen);
      remove.call(socket, 'error', handleErr);
    }
  }

  function handleOpen(evt) {
    cleanup(); callback();
  }

  function handleErr (evt) {
    cleanup(); callback(evt);
  }

  // if the socket is closing or closed, return end
  if (socket.readyState >= 2) {
    return callback(true);
  }

  // if open, trigger the callback
  if (socket.readyState === 1) {
    return callback();
  }

  socket.addEventListener('open', handleOpen);
  socket.addEventListener('error', handleErr);
};

},{}],56:[function(require,module,exports){
(function (process){
var pull = require('pull-core');
var ready = require('./ready');

/**
  ### `sink(socket, opts?)`

  Create a pull-stream `Sink` that will write data to the `socket`.

  <<< examples/write.js

**/
module.exports = pull.Sink(function(read, socket, opts) {
  opts = opts || {}
  var closeOnEnd = opts.closeOnEnd !== false;
  var onClose = 'function' === typeof opts ? opts : opts.onClose;

  function next(end, data) {
    // if the stream has ended, simply return
    if (end) {
      if (closeOnEnd && socket.readyState <= 1) {
        if(onClose)
          socket.addEventListener('close', function (ev) {
            if(ev.wasClean) onClose()
            else {
              var err = new Error('ws error')
              err.event = ev
              onClose(err)
            }
          });

        socket.close();
      }

      return;
    }

    // socket ready?
    ready(socket, function(end) {
      if (end) {
        return read(end, function () {});
      }

      socket.send(data);
      process.nextTick(function() {
        read(null, next);
      });
    });
  }

  read(null, next);
});

}).call(this,require('_process'))
},{"./ready":55,"_process":94,"pull-core":54}],57:[function(require,module,exports){
var pull = require('pull-core');
var ready = require('./ready');

/**
  ### `source(socket)`

  Create a pull-stream `Source` that will read data from the `socket`.

  <<< examples/read.js

**/
module.exports = pull.Source(function(socket) {
  var buffer = [];
  var receiver;
  var ended;

  socket.addEventListener('message', function(evt) {
    if (receiver) {
      return receiver(null, evt.data);
    }

    buffer.push(evt.data);
  });

  socket.addEventListener('close', function(evt) {
    if (ended) return;
    if (receiver) {
      return receiver(ended = true);
    }
  });

  socket.addEventListener('error', function (evt) {
    if (ended) return;
    ended = evt;
    if (receiver) {
      receiver(ended);
    }
  });

  function read(abort, cb) {
    receiver = null;

    //if stream has already ended.
    if (ended)
      return cb(ended)

    // if ended, abort
    if (abort) {
      //this will callback when socket closes
      receiver = cb
      return socket.close()
    }

    ready(socket, function(end) {
      if (end) {
        return cb(ended = end);
      }

      // read from the socket
      if (ended && ended !== true) {
        return cb(ended);
      }
      else if (buffer.length > 0) {
        return cb(null, buffer.shift());
      }
      else if (ended) {
        return cb(true);
      }

      receiver = cb;
    });
  };

  return read;
});

},{"./ready":55,"pull-core":54}],58:[function(require,module,exports){

/**
 * Module dependencies.
 */

var global = (function() { return this; })();

/**
 * WebSocket constructor.
 */

var WebSocket = global.WebSocket || global.MozWebSocket;

/**
 * Module exports.
 */

module.exports = WebSocket ? ws : null;

/**
 * WebSocket constructor.
 *
 * The third `opts` options object gets ignored in web browsers, since it's
 * non-standard, and throws a TypeError if passed to the constructor.
 * See: https://github.com/einaros/ws/issues/227
 *
 * @param {String} uri
 * @param {Array} protocols (optional)
 * @param {Object) opts (optional)
 * @api public
 */

function ws(uri, protocols, opts) {
  var instance;
  if (protocols) {
    instance = new WebSocket(uri, protocols);
  } else {
    instance = new WebSocket(uri);
  }
  return instance;
}

if (WebSocket) ws.prototype = WebSocket.prototype;

},{}],59:[function(require,module,exports){
var reHttpUrl = /^http(.*)$/;

/**
  # wsurl

  Given a url (including protocol relative urls - i.e. `//`), generate an appropriate
  url for a WebSocket endpoint (`ws` or `wss`).

  ## Example Usage

  <<< examples/relative.js

**/

module.exports = function(url, opts) {
  var current = (opts || {}).current || (typeof location != 'undefined' && location.href);
  var currentProtocol = current && current.slice(0, current.indexOf(':'));
  var insecure = (opts || {}).insecure;
  var isRelative = url.slice(0, 2) == '//';
  var forceWS = (! currentProtocol) || currentProtocol === 'file:';

  if (isRelative) {
    return forceWS ?
      ((insecure ? 'ws:' : 'wss:') + url) :
      (currentProtocol.replace(reHttpUrl, 'ws$1') + ':' + url);
  }

  return url.replace(reHttpUrl, 'ws$1');
};

},{}],60:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('rtc/cleanup');

var CANNOT_CLOSE_STATES = [
  'closed'
];

var EVENTS_DECOUPLE_BC = [
  'addstream',
  'datachannel',
  'icecandidate',
  'negotiationneeded',
  'removestream',
  'signalingstatechange'
];

var EVENTS_DECOUPLE_AC = [
  'iceconnectionstatechange'
];

/**
  ### rtc-tools/cleanup

  ```
  cleanup(pc)
  ```

  The `cleanup` function is used to ensure that a peer connection is properly
  closed and ready to be cleaned up by the browser.

**/
module.exports = function(pc) {
  // see if we can close the connection
  var currentState = pc.iceConnectionState;
  var canClose = CANNOT_CLOSE_STATES.indexOf(currentState) < 0;

  function decouple(events) {
    events.forEach(function(evtName) {
      if (pc['on' + evtName]) {
        pc['on' + evtName] = null;
      }
    });
  }

  // decouple "before close" events
  decouple(EVENTS_DECOUPLE_BC);

  if (canClose) {
    debug('attempting connection close, current state: '+ pc.iceConnectionState);
    pc.close();
  }

  // remove the event listeners
  // after a short delay giving the connection time to trigger
  // close and iceconnectionstatechange events
  setTimeout(function() {
    decouple(EVENTS_DECOUPLE_AC);
  }, 100);
};

},{"cog/logger":24}],61:[function(require,module,exports){
/* jshint node: true */
'use strict';

var mbus = require('mbus');
var queue = require('rtc-taskqueue');
var cleanup = require('./cleanup');
var monitor = require('./monitor');
var throttle = require('cog/throttle');
var pluck = require('whisk/pluck');
var pluckCandidate = pluck('candidate', 'sdpMid', 'sdpMLineIndex');
var CLOSED_STATES = [ 'closed', 'failed' ];
var CHECKING_STATES = [ 'checking' ];

/**
  ### rtc-tools/couple

  #### couple(pc, targetId, signaller, opts?)

  Couple a WebRTC connection with another webrtc connection identified by
  `targetId` via the signaller.

  The following options can be provided in the `opts` argument:

  - `sdpfilter` (default: null)

    A simple function for filtering SDP as part of the peer
    connection handshake (see the Using Filters details below).

  ##### Example Usage

  ```js
  var couple = require('rtc/couple');

  couple(pc, '54879965-ce43-426e-a8ef-09ac1e39a16d', signaller);
  ```

  ##### Using Filters

  In certain instances you may wish to modify the raw SDP that is provided
  by the `createOffer` and `createAnswer` calls.  This can be done by passing
  a `sdpfilter` function (or array) in the options.  For example:

  ```js
  // run the sdp from through a local tweakSdp function.
  couple(pc, '54879965-ce43-426e-a8ef-09ac1e39a16d', signaller, {
    sdpfilter: tweakSdp
  });
  ```

**/
function couple(pc, targetId, signaller, opts) {
  var debugLabel = (opts || {}).debugLabel || 'rtc';
  var debug = require('cog/logger')(debugLabel + '/couple');

  // create a monitor for the connection
  var mon = monitor(pc, targetId, signaller, (opts || {}).logger);
  var emit = mbus('', mon);
  var reactive = (opts || {}).reactive;
  var endOfCandidates = true;

  // configure the time to wait between receiving a 'disconnect'
  // iceConnectionState and determining that we are closed
  var disconnectTimeout = (opts || {}).disconnectTimeout || 10000;
  var disconnectTimer;

  // initilaise the negotiation helpers
  var isMaster = signaller.isMaster(targetId);

  // initialise the processing queue (one at a time please)
  var q = queue(pc, opts);

  var createOrRequestOffer = throttle(function() {
    if (! isMaster) {
      return signaller.to(targetId).send('/negotiate');
    }

    q.createOffer();
  }, 100, { leading: false });

  var debounceOffer = throttle(q.createOffer, 100, { leading: false });

  function decouple() {
    debug('decoupling ' + signaller.id + ' from ' + targetId);

    // stop the monitor
//     mon.removeAllListeners();
    mon.stop();

    // cleanup the peerconnection
    cleanup(pc);

    // remove listeners
    signaller.removeListener('sdp', handleSdp);
    signaller.removeListener('candidate', handleCandidate);
    signaller.removeListener('negotiate', handleNegotiateRequest);

    // remove listeners (version >= 5)
    signaller.removeListener('message:sdp', handleSdp);
    signaller.removeListener('message:candidate', handleCandidate);
    signaller.removeListener('message:negotiate', handleNegotiateRequest);
  }

  function handleCandidate(data, src) {
    // if the source is unknown or not a match, then don't process
    if ((! src) || (src.id !== targetId)) {
      return;
    }

    q.addIceCandidate(data);
  }

  function handleSdp(sdp, src) {
    // if the source is unknown or not a match, then don't process
    if ((! src) || (src.id !== targetId)) {
      return;
    }

    emit('sdp.remote', sdp);
    q.setRemoteDescription(sdp);
  }

  function handleConnectionClose() {
    debug('captured pc close, iceConnectionState = ' + pc.iceConnectionState);
    decouple();
  }

  function handleDisconnect() {
    debug('captured pc disconnect, monitoring connection status');

    // start the disconnect timer
    disconnectTimer = setTimeout(function() {
      debug('manually closing connection after disconnect timeout');
      cleanup(pc);
    }, disconnectTimeout);

    mon.on('statechange', handleDisconnectAbort);
  }

  function handleDisconnectAbort() {
    debug('connection state changed to: ' + pc.iceConnectionState);

    // if the state is checking, then do not reset the disconnect timer as
    // we are doing our own checking
    if (CHECKING_STATES.indexOf(pc.iceConnectionState) >= 0) {
      return;
    }

    resetDisconnectTimer();

    // if we have a closed or failed status, then close the connection
    if (CLOSED_STATES.indexOf(pc.iceConnectionState) >= 0) {
      return mon('closed');
    }

    mon.once('disconnect', handleDisconnect);
  }

  function handleLocalCandidate(evt) {
    var data = evt.candidate && pluckCandidate(evt.candidate);

    if (evt.candidate) {
      resetDisconnectTimer();
      emit('ice.local', data);
      signaller.to(targetId).send('/candidate', data);
      endOfCandidates = false;
    }
    else if (! endOfCandidates) {
      endOfCandidates = true;
      emit('ice.gathercomplete');
      signaller.to(targetId).send('/endofcandidates', {});
    }
  }

  function handleNegotiateRequest(src) {
    if (src.id === targetId) {
      emit('negotiate.request', src.id);
      debounceOffer();
    }
  }

  function resetDisconnectTimer() {
    mon.off('statechange', handleDisconnectAbort);

    // clear the disconnect timer
    debug('reset disconnect timer, state: ' + pc.iceConnectionState);
    clearTimeout(disconnectTimer);
  }

  // when regotiation is needed look for the peer
  if (reactive) {
    pc.onnegotiationneeded = function() {
      emit('negotiate.renegotiate');
      createOrRequestOffer();
    };
  }

  pc.onicecandidate = handleLocalCandidate;

  // when the task queue tells us we have sdp available, send that over the wire
  q.on('sdp.local', function(desc) {
    signaller.to(targetId).send('/sdp', desc);
  });

  // when we receive sdp, then
  signaller.on('sdp', handleSdp);
  signaller.on('candidate', handleCandidate);

  // listeners (signaller >= 5)
  signaller.on('message:sdp', handleSdp);
  signaller.on('message:candidate', handleCandidate);

  // if this is a master connection, listen for negotiate events
  if (isMaster) {
    signaller.on('negotiate', handleNegotiateRequest);
    signaller.on('message:negotiate', handleNegotiateRequest); // signaller >= 5
  }

  // when the connection closes, remove event handlers
  mon.once('closed', handleConnectionClose);
  mon.once('disconnected', handleDisconnect);

  // patch in the create offer functions
  mon.createOffer = createOrRequestOffer;

  return mon;
}

module.exports = couple;

},{"./cleanup":60,"./monitor":65,"cog/logger":24,"cog/throttle":25,"mbus":26,"rtc-taskqueue":66,"whisk/pluck":77}],62:[function(require,module,exports){
/* jshint node: true */
'use strict';

/**
  ### rtc-tools/detect

  Provide the [rtc-core/detect](https://github.com/rtc-io/rtc-core#detect)
  functionality.
**/
module.exports = require('rtc-core/detect');

},{"rtc-core/detect":27}],63:[function(require,module,exports){
/* jshint node: true */
'use strict';

var debug = require('cog/logger')('generators');
var detect = require('./detect');
var defaults = require('cog/defaults');

var mappings = {
  create: {
    dtls: function(c) {
      if (! detect.moz) {
        c.optional = (c.optional || []).concat({ DtlsSrtpKeyAgreement: true });
      }
    }
  }
};

/**
  ### rtc-tools/generators

  The generators package provides some utility methods for generating
  constraint objects and similar constructs.

  ```js
  var generators = require('rtc/generators');
  ```

**/

/**
  #### generators.config(config)

  Generate a configuration object suitable for passing into an W3C
  RTCPeerConnection constructor first argument, based on our custom config.

  In the event that you use short term authentication for TURN, and you want
  to generate new `iceServers` regularly, you can specify an iceServerGenerator
  that will be used prior to coupling. This generator should return a fully
  compliant W3C (RTCIceServer dictionary)[http://www.w3.org/TR/webrtc/#idl-def-RTCIceServer].

  If you pass in both a generator and iceServers, the iceServers _will be
  ignored and the generator used instead.
**/

exports.config = function(config) {
  var iceServerGenerator = (config || {}).iceServerGenerator;

  return defaults({}, config, {
    iceServers: typeof iceServerGenerator == 'function' ? iceServerGenerator() : []
  });
};

/**
  #### generators.connectionConstraints(flags, constraints)

  This is a helper function that will generate appropriate connection
  constraints for a new `RTCPeerConnection` object which is constructed
  in the following way:

  ```js
  var conn = new RTCPeerConnection(flags, constraints);
  ```

  In most cases the constraints object can be left empty, but when creating
  data channels some additional options are required.  This function
  can generate those additional options and intelligently combine any
  user defined constraints (in `constraints`) with shorthand flags that
  might be passed while using the `rtc.createConnection` helper.
**/
exports.connectionConstraints = function(flags, constraints) {
  var generated = {};
  var m = mappings.create;
  var out;

  // iterate through the flags and apply the create mappings
  Object.keys(flags || {}).forEach(function(key) {
    if (m[key]) {
      m[key](generated);
    }
  });

  // generate the connection constraints
  out = defaults({}, constraints, generated);
  debug('generated connection constraints: ', out);

  return out;
};

},{"./detect":62,"cog/defaults":20,"cog/logger":24}],64:[function(require,module,exports){
/* jshint node: true */

'use strict';

/**
  # rtc-tools

  The `rtc-tools` module does most of the heavy lifting within the
  [rtc.io](http://rtc.io) suite.  Primarily it handles the logic of coupling
  a local `RTCPeerConnection` with it's remote counterpart via an
  [rtc-signaller](https://github.com/rtc-io/rtc-signaller) signalling
  channel.

  ## Getting Started

  If you decide that the `rtc-tools` module is a better fit for you than either
  [rtc-quickconnect](https://github.com/rtc-io/rtc-quickconnect) or
  [rtc](https://github.com/rtc-io/rtc) then the code snippet below
  will provide you a guide on how to get started using it in conjunction with
  the [rtc-signaller](https://github.com/rtc-io/rtc-signaller) (version 5.0 and above)
  and [rtc-media](https://github.com/rtc-io/rtc-media) modules:

  <<< examples/getting-started.js

  This code definitely doesn't cover all the cases that you need to consider
  (i.e. peers leaving, etc) but it should demonstrate how to:

  1. Capture video and add it to a peer connection
  2. Couple a local peer connection with a remote peer connection
  3. Deal with the remote steam being discovered and how to render
     that to the local interface.

  ## Reference

**/

var gen = require('./generators');

// export detect
var detect = exports.detect = require('./detect');
var findPlugin = require('rtc-core/plugin');

// export cog logger for convenience
exports.logger = require('cog/logger');

// export peer connection
var RTCPeerConnection =
exports.RTCPeerConnection = detect('RTCPeerConnection');

// add the couple utility
exports.couple = require('./couple');

/**
  ### createConnection

  ```
  createConnection(opts?, constraints?) => RTCPeerConnection
  ```

  Create a new `RTCPeerConnection` auto generating default opts as required.

  ```js
  var conn;

  // this is ok
  conn = rtc.createConnection();

  // and so is this
  conn = rtc.createConnection({
    iceServers: []
  });
  ```
**/
exports.createConnection = function(opts, constraints) {
  var plugin = findPlugin((opts || {}).plugins);
  var PeerConnection = (opts || {}).RTCPeerConnection || RTCPeerConnection;

  // generate the config based on options provided
  var config = gen.config(opts);

  // generate appropriate connection constraints
  constraints = gen.connectionConstraints(opts, constraints);

  if (plugin && typeof plugin.createConnection == 'function') {
    return plugin.createConnection(config, constraints);
  }

  return new PeerConnection(config, constraints);
};

},{"./couple":61,"./detect":62,"./generators":63,"cog/logger":24,"rtc-core/plugin":30}],65:[function(require,module,exports){
/* jshint node: true */
'use strict';

var mbus = require('mbus');

// define some state mappings to simplify the events we generate
var stateMappings = {
  completed: 'connected'
};

// define the events that we need to watch for peer connection
// state changes
var peerStateEvents = [
  'signalingstatechange',
  'iceconnectionstatechange',
];

/**
  ### rtc-tools/monitor

  ```
  monitor(pc, targetId, signaller, parentBus) => mbus
  ```

  The monitor is a useful tool for determining the state of `pc` (an
  `RTCPeerConnection`) instance in the context of your application. The
  monitor uses both the `iceConnectionState` information of the peer
  connection and also the various
  [signaller events](https://github.com/rtc-io/rtc-signaller#signaller-events)
  to determine when the connection has been `connected` and when it has
  been `disconnected`.

  A monitor created `mbus` is returned as the result of a
  [couple](https://github.com/rtc-io/rtc#rtccouple) between a local peer
  connection and it's remote counterpart.

**/
module.exports = function(pc, targetId, signaller, parentBus) {
  var monitor = mbus('', parentBus);
  var state;

  function checkState() {
    var newState = getMappedState(pc.iceConnectionState);

    // flag the we had a state change
    monitor('statechange', pc, newState);

    // if the active state has changed, then send the appopriate message
    if (state !== newState) {
      monitor(newState);
      state = newState;
    }
  }

  function handleClose() {
    monitor('closed');
  }

  pc.onclose = handleClose;
  peerStateEvents.forEach(function(evtName) {
    pc['on' + evtName] = checkState;
  });

  monitor.stop = function() {
    pc.onclose = null;
    peerStateEvents.forEach(function(evtName) {
      pc['on' + evtName] = null;
    });
  };

  monitor.checkState = checkState;

  // if we haven't been provided a valid peer connection, abort
  if (! pc) {
    return monitor;
  }

  // determine the initial is active state
  state = getMappedState(pc.iceConnectionState);

  return monitor;
};

/* internal helpers */

function getMappedState(state) {
  return stateMappings[state] || state;
}

},{"mbus":26}],66:[function(require,module,exports){
var detect = require('rtc-core/detect');
var findPlugin = require('rtc-core/plugin');
var PriorityQueue = require('priorityqueuejs');
var pluck = require('whisk/pluck');
var pluckSessionDesc = pluck('sdp', 'type');

// some validation routines
var checkCandidate = require('rtc-validator/candidate');

// the sdp cleaner
var sdpclean = require('rtc-sdpclean');
var parseSdp = require('rtc-sdp');

var PRIORITY_LOW = 100;
var PRIORITY_WAIT = 1000;

// priority order (lower is better)
var DEFAULT_PRIORITIES = [
  'createOffer',
  'setLocalDescription',
  'createAnswer',
  'setRemoteDescription',
  'addIceCandidate'
];

// define event mappings
var METHOD_EVENTS = {
  setLocalDescription: 'setlocaldesc',
  setRemoteDescription: 'setremotedesc',
  createOffer: 'offer',
  createAnswer: 'answer'
};

var MEDIA_MAPPINGS = {
  data: 'application'
};

// define states in which we will attempt to finalize a connection on receiving a remote offer
var VALID_RESPONSE_STATES = ['have-remote-offer', 'have-local-pranswer'];

/**
  Allows overriding of a function
 **/
function pluggable(pluginFn, defaultFn) {
  return (pluginFn && typeof pluginFn == 'function' ? pluginFn : defaultFn);
}

/**
  # rtc-taskqueue

  This is a package that assists with applying actions to an `RTCPeerConnection`
  in as reliable order as possible. It is primarily used by the coupling logic
  of the [`rtc-tools`](https://github.com/rtc-io/rtc-tools).

  ## Example Usage

  For the moment, refer to the simple coupling test as an example of how to use
  this package (see below):

  <<< test/couple.js

**/
module.exports = function(pc, opts) {
  opts = opts || {};
  // create the task queue
  var queue = new PriorityQueue(orderTasks);
  var tq = require('mbus')('', (opts || {}).logger);

  // initialise task importance
  var priorities = (opts || {}).priorities || DEFAULT_PRIORITIES;
  var queueInterval = (opts || {}).interval || 10;

  // check for plugin usage
  var plugin = findPlugin((opts || {}).plugins);

  // initialise state tracking
  var checkQueueTimer = 0;
  var defaultFail = tq.bind(tq, 'fail');

  // look for an sdpfilter function (allow slight mis-spellings)
  var sdpFilter = (opts || {}).sdpfilter || (opts || {}).sdpFilter;
  var alwaysParse = (opts.sdpParseMode === 'always');

  // initialise session description and icecandidate objects
  var RTCSessionDescription = (opts || {}).RTCSessionDescription ||
    detect('RTCSessionDescription');

  var RTCIceCandidate = (opts || {}).RTCIceCandidate ||
    detect('RTCIceCandidate');

  // Determine plugin overridable methods
  var createIceCandidate = pluggable(plugin && plugin.createIceCandidate, function(data) {
    return new RTCIceCandidate(data);
  });

  var createSessionDescription = pluggable(plugin && plugin.createSessionDescription, function(data) {
    return new RTCSessionDescription(data);
  });

  function abortQueue(err) {
    console.error(err);
  }

  function applyCandidate(task, next) {
    var data = task.args[0];
    // Allow selective filtering of ICE candidates
    if (opts && opts.filterCandidate && !opts.filterCandidate(data)) {
      tq('ice.remote.filtered', candidate);
      return next();
    }
    var candidate = data && data.candidate && createIceCandidate(data);

    function handleOk() {
      tq('ice.remote.applied', candidate);
      next();
    }

    function handleFail(err) {
      tq('ice.remote.invalid', candidate);
      next(err);
    }

    // we have a null candidate, we have finished gathering candidates
    if (! candidate) {
      return next();
    }

    pc.addIceCandidate(candidate, handleOk, handleFail);
  }

  function checkQueue() {
    // peek at the next item on the queue
    var next = (! queue.isEmpty()) && queue.peek();
    var ready = next && testReady(next);

    // reset the queue timer
    checkQueueTimer = 0;

    // if we don't have a task ready, then abort
    if (! ready) {
      // if we have a task and it has expired then dequeue it
      if (next && (aborted(next) || expired(next))) {
        tq('task.expire', next);
        queue.deq();
      }

      return (! queue.isEmpty()) && isNotClosed(pc) && triggerQueueCheck();
    }

    // properly dequeue task
    next = queue.deq();

    // process the task
    next.fn(next, function(err) {
      var fail = next.fail || defaultFail;
      var pass = next.pass;
      var taskName = next.name;

      // if errored, fail
      if (err) {
        console.error(taskName + ' task failed: ', err);
        return fail(err);
      }

      if (typeof pass == 'function') {
        pass.apply(next, [].slice.call(arguments, 1));
      }

      // Allow tasks to indicate that processing should continue immediately to the
      // following task
      if (next.immediate) {
        if (checkQueueTimer) clearTimeout(checkQueueTimer);
        return checkQueue();
      } else {
        triggerQueueCheck();
      }
    });
  }

  function cleansdp(desc) {
    // ensure we have clean sdp
    var sdpErrors = [];
    var sdp = desc && sdpclean(desc.sdp, { collector: sdpErrors });

    // if we don't have a match, log some info
    if (desc && sdp !== desc.sdp) {
      console.info('invalid lines removed from sdp: ', sdpErrors);
      desc.sdp = sdp;
    }

    // if a filter has been specified, then apply the filter
    if (typeof sdpFilter == 'function') {
      desc.sdp = sdpFilter(desc.sdp, pc);
    }

    return desc;
  }

  function completeConnection() {
    // Clean any cached media types now that we have potentially new remote description
    if (pc.__mediaTypes) {
      delete pc.__mediaTypes;
    }

    if (VALID_RESPONSE_STATES.indexOf(pc.signalingState) >= 0) {
      return tq.createAnswer();
    }
  }

  function emitSdp() {
    tq('sdp.local', pluckSessionDesc(this.args[0]));
  }

  function enqueue(name, handler, opts) {
    return function() {
      var args = [].slice.call(arguments);

      if (opts && typeof opts.processArgs == 'function') {
        args = args.map(opts.processArgs);
      }

      var priority = priorities.indexOf(name);

      queue.enq({
        args: args,
        name: name,
        fn: handler,
        priority: priority >= 0 ? priority : PRIORITY_LOW,
        immediate: opts.immediate,
        // If aborted, the task will be removed
        aborted: false,

        // record the time at which the task was queued
        start: Date.now(),

        // initilaise any checks that need to be done prior
        // to the task executing
        checks: [ isNotClosed ].concat((opts || {}).checks || []),

        // initialise the pass and fail handlers
        pass: (opts || {}).pass,
        fail: (opts || {}).fail
      });

      triggerQueueCheck();
    };
  }

  function execMethod(task, next) {
    var fn = pc[task.name];
    var eventName = METHOD_EVENTS[task.name] || (task.name || '').toLowerCase();
    var cbArgs = [ success, fail ];
    var isOffer = task.name === 'createOffer';

    function fail(err) {
      tq.apply(tq, [ 'negotiate.error', task.name, err ].concat(task.args));
      next(err);
    }

    function success() {
      tq.apply(tq, [ ['negotiate', eventName, 'ok'], task.name ].concat(task.args));
      next.apply(null, [null].concat([].slice.call(arguments)));
    }

    if (! fn) {
      return next(new Error('cannot call "' + task.name + '" on RTCPeerConnection'));
    }

    // invoke the function
    tq.apply(tq, ['negotiate.' + eventName].concat(task.args));
    fn.apply(
      pc,
      task.args.concat(cbArgs).concat(isOffer ? generateConstraints() : [])
    );
  }

  function expired(task) {
    return (typeof task.ttl == 'number') && (task.start + task.ttl < Date.now());
  }

  function aborted(task) {
    return task && task.aborted;
  }

  function extractCandidateEventData(data) {
    // extract nested candidate data (like we will see in an event being passed to this function)
    while (data && data.candidate && data.candidate.candidate) {
      data = data.candidate;
    }

    return data;
  }

  function generateConstraints() {
    var allowedKeys = {
      offertoreceivevideo: 'OfferToReceiveVideo',
      offertoreceiveaudio: 'OfferToReceiveAudio',
      icerestart: 'IceRestart',
      voiceactivitydetection: 'VoiceActivityDetection'
    };

    var constraints = {
      OfferToReceiveVideo: true,
      OfferToReceiveAudio: true
    };

    // update known keys to match
    Object.keys(opts || {}).forEach(function(key) {
      if (allowedKeys[key.toLowerCase()]) {
        constraints[allowedKeys[key.toLowerCase()]] = opts[key];
      }
    });

    return { mandatory: constraints };
  }

  function hasLocalOrRemoteDesc(pc, task) {
    return pc.__hasDesc || (pc.__hasDesc = !!pc.remoteDescription);
  }

  function isNotNegotiating(pc) {
    return pc.signalingState !== 'have-local-offer';
  }

  function isNotClosed(pc) {
    return pc.signalingState !== 'closed';
  }

  function isStable(pc) {
    return pc.signalingState === 'stable';
  }

  function isValidCandidate(pc, data) {
    return data.__valid ||
      (data.__valid = checkCandidate(data.args[0]).length === 0);
  }

  function isConnReadyForCandidate(pc, data) {
    var sdpMid = data.args[0] && data.args[0].sdpMid;

    // remap media types as appropriate
    sdpMid = MEDIA_MAPPINGS[sdpMid] || sdpMid;

    if (sdpMid === '')
      return true;

    // Allow parsing of SDP always if required
    if (alwaysParse || !pc.__mediaTypes) {
      var sdp = parseSdp(pc.remoteDescription && pc.remoteDescription.sdp);
      // We only want to cache the SDP media types if we've received them, otherwise
      // bad things can happen
      var mediaTypes = sdp.getMediaTypes();
      if (mediaTypes && mediaTypes.length > 0) {
        pc.__mediaTypes = sdp.getMediaTypes();
      }
    }
    // the candidate is valid if we know about the media type
    var validMediaType = pc.__mediaTypes && pc.__mediaTypes.indexOf(sdpMid) >= 0;
    // Otherwise we abort the task
    if (!validMediaType) {
      data.aborted = true;
    }
    return validMediaType;
  }

  function orderTasks(a, b) {
    // apply each of the checks for each task
    var tasks = [a,b];
    var readiness = tasks.map(testReady);
    var taskPriorities = tasks.map(function(task, idx) {
      var ready = readiness[idx];
      return ready ? task.priority : PRIORITY_WAIT;
    });

    return taskPriorities[1] - taskPriorities[0];
  }

  // check whether a task is ready (does it pass all the checks)
  function testReady(task) {
    return (task.checks || []).reduce(function(memo, check) {
      return memo && check(pc, task);
    }, true);
  }

  function triggerQueueCheck() {
    if (checkQueueTimer) return;
    checkQueueTimer = setTimeout(checkQueue, queueInterval);
  }

  // patch in the queue helper methods
  tq.addIceCandidate = enqueue('addIceCandidate', applyCandidate, {
    processArgs: extractCandidateEventData,
    checks: [hasLocalOrRemoteDesc, isValidCandidate, isConnReadyForCandidate ],

    // set ttl to 5s
    ttl: 5000,
    immediate: true
  });

  tq.setLocalDescription = enqueue('setLocalDescription', execMethod, {
    processArgs: cleansdp,
    pass: emitSdp
  });

  tq.setRemoteDescription = enqueue('setRemoteDescription', execMethod, {
    processArgs: createSessionDescription,
    pass: completeConnection
  });

  tq.createOffer = enqueue('createOffer', execMethod, {
    checks: [ isNotNegotiating ],
    pass: tq.setLocalDescription
  });

  tq.createAnswer = enqueue('createAnswer', execMethod, {
    pass: tq.setLocalDescription
  });

  return tq;
};

},{"mbus":26,"priorityqueuejs":67,"rtc-core/detect":27,"rtc-core/plugin":30,"rtc-sdp":68,"rtc-sdpclean":70,"rtc-validator/candidate":71,"whisk/pluck":77}],67:[function(require,module,exports){
/**
 * Expose `PriorityQueue`.
 */
module.exports = PriorityQueue;

/**
 * Initializes a new empty `PriorityQueue` with the given `comparator(a, b)`
 * function, uses `.DEFAULT_COMPARATOR()` when no function is provided.
 *
 * The comparator function must return a positive number when `a > b`, 0 when
 * `a == b` and a negative number when `a < b`.
 *
 * @param {Function}
 * @return {PriorityQueue}
 * @api public
 */
function PriorityQueue(comparator) {
  this._comparator = comparator || PriorityQueue.DEFAULT_COMPARATOR;
  this._elements = [];
}

/**
 * Compares `a` and `b`, when `a > b` it returns a positive number, when
 * it returns 0 and when `a < b` it returns a negative number.
 *
 * @param {String|Number} a
 * @param {String|Number} b
 * @return {Number}
 * @api public
 */
PriorityQueue.DEFAULT_COMPARATOR = function(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  } else {
    a = a.toString();
    b = b.toString();

    if (a == b) return 0;

    return (a > b) ? 1 : -1;
  }
};

/**
 * Returns whether the priority queue is empty or not.
 *
 * @return {Boolean}
 * @api public
 */
PriorityQueue.prototype.isEmpty = function() {
  return this.size() === 0;
};

/**
 * Peeks at the top element of the priority queue.
 *
 * @return {Object}
 * @throws {Error} when the queue is empty.
 * @api public
 */
PriorityQueue.prototype.peek = function() {
  if (this.isEmpty()) throw new Error('PriorityQueue is empty');

  return this._elements[0];
};

/**
 * Dequeues the top element of the priority queue.
 *
 * @return {Object}
 * @throws {Error} when the queue is empty.
 * @api public
 */
PriorityQueue.prototype.deq = function() {
  var first = this.peek();
  var last = this._elements.pop();
  var size = this.size();

  if (size === 0) return first;

  this._elements[0] = last;
  var current = 0;

  while (current < size) {
    var largest = current;
    var left = (2 * current) + 1;
    var right = (2 * current) + 2;

    if (left < size && this._compare(left, largest) >= 0) {
      largest = left;
    }

    if (right < size && this._compare(right, largest) >= 0) {
      largest = right;
    }

    if (largest === current) break;

    this._swap(largest, current);
    current = largest;
  }

  return first;
};

/**
 * Enqueues the `element` at the priority queue and returns its new size.
 *
 * @param {Object} element
 * @return {Number}
 * @api public
 */
PriorityQueue.prototype.enq = function(element) {
  var size = this._elements.push(element);
  var current = size - 1;

  while (current > 0) {
    var parent = Math.floor((current - 1) / 2);

    if (this._compare(current, parent) <= 0) break;

    this._swap(parent, current);
    current = parent;
  }

  return size;
};

/**
 * Returns the size of the priority queue.
 *
 * @return {Number}
 * @api public
 */
PriorityQueue.prototype.size = function() {
  return this._elements.length;
};

/**
 *  Iterates over queue elements
 *
 *  @param {Function} fn
 */
PriorityQueue.prototype.forEach = function(fn) {
  return this._elements.forEach(fn);
};

/**
 * Compares the values at position `a` and `b` in the priority queue using its
 * comparator function.
 *
 * @param {Number} a
 * @param {Number} b
 * @return {Number}
 * @api private
 */
PriorityQueue.prototype._compare = function(a, b) {
  return this._comparator(this._elements[a], this._elements[b]);
};

/**
 * Swaps the values at position `a` and `b` in the priority queue.
 *
 * @param {Number} a
 * @param {Number} b
 * @api private
 */
PriorityQueue.prototype._swap = function(a, b) {
  var aux = this._elements[a];
  this._elements[a] = this._elements[b];
  this._elements[b] = aux;
};

},{}],68:[function(require,module,exports){
/* jshint node: true */
'use strict';

var nub = require('whisk/nub');
var pluck = require('whisk/pluck');
var flatten = require('whisk/flatten');
var reLineBreak = /\r?\n/;
var reTrailingNewlines = /\r?\n$/;

// list sdp line types that are not "significant"
var nonHeaderLines = [ 'a', 'c', 'b', 'k' ];
var parsers = require('./parsers');

/**
  # rtc-sdp

  This is a utility module for intepreting and patching sdp.

  ## Usage

  The `rtc-sdp` main module exposes a single function that is capable of
  parsing lines of SDP, and providing an object allowing you to perform
  operations on those parsed lines:

  ```js
  var sdp = require('rtc-sdp')(lines);
  ```

  The currently supported operations are listed below:

**/
module.exports = function(sdp) {
  var ops = {};
  var parsed = [];
  var activeCollector;

  // initialise the lines
  var lines = sdp.split(reLineBreak).filter(Boolean).map(function(line) {
    return line.split('=');
  });

  var inputOrder = nub(lines.filter(function(line) {
    return line[0] && nonHeaderLines.indexOf(line[0]) < 0;
  }).map(pluck(0)));

  var findLine = ops.findLine = function(type, index) {
    var lineData = parsed.filter(function(line) {
      return line[0] === type;
    })[index || 0];

    return lineData && lineData[1];
  };

  // push into parsed sections
  lines.forEach(function(line) {
    var customParser = parsers[line[0]];

    if (customParser) {
      activeCollector = customParser(parsed, line);
    }
    else if (activeCollector) {
      activeCollector = activeCollector(line);
    }
    else {
      parsed.push(line);
    }
  });

  /**
    ### `sdp.addIceCandidate(data)`

    Modify the sdp to include candidates as denoted by the data.

**/
  ops.addIceCandidate = function(data) {
    var lineIndex = (data || {}).lineIndex || (data || {}).sdpMLineIndex;
    var mLine = typeof lineIndex != 'undefined' && findLine('m', lineIndex);
    var candidate = (data || {}).candidate;

    // if we have the mLine add the new candidate
    if (mLine && candidate) {
      mLine.childlines.push(candidate.replace(reTrailingNewlines, '').split('='));
    }
  };

  /**
    ### `sdp.getMediaTypes() => []`

    Retrieve the list of media types that have been defined in the sdp via
    `m=` lines.
  **/
  ops.getMediaTypes = function() {
    function getMediaType(data) {
      return data[1].def.split(/\s/)[0];
    }

    return parsed.filter(function(parts) {
      return parts[0] === 'm' && parts[1] && parts[1].def;
    }).map(getMediaType);
  };

  /**
    ### `sdp.toString()`

    Convert the SDP structure that is currently retained in memory, into a string
    that can be provided to a `setLocalDescription` (or `setRemoteDescription`)
    WebRTC call.

  **/
  ops.toString = function() {
    return parsed.map(function(line) {
      return typeof line[1].toArray == 'function' ? line[1].toArray() : [ line ];
    }).reduce(flatten).map(function(line) {
      return line.join('=');
    }).join('\n');
  };

  /**
    ## SDP Filtering / Munging Functions

    There are additional functions included in the module to assign with
    performing "single-shot" SDP filtering (or munging) operations:

  **/

  return ops;
};

},{"./parsers":69,"whisk/flatten":74,"whisk/nub":76,"whisk/pluck":77}],69:[function(require,module,exports){
/* jshint node: true */
'use strict';

exports.m = function(parsed, line) {
  var media = {
    def: line[1],
    childlines: [],

    toArray: function() {
      return [
        ['m', media.def ]
      ].concat(media.childlines);
    }
  };

  function addChildLine(childLine) {
    media.childlines.push(childLine);
    return addChildLine;
  }

  parsed.push([ 'm', media ]);

  return addChildLine;
};
},{}],70:[function(require,module,exports){
var validators = [
  [ /^(a\=candidate.*)$/, require('rtc-validator/candidate') ]
];

var reSdpLineBreak = /(\r?\n|\\r\\n)/;

/**
  # rtc-sdpclean

  Remove invalid lines from your SDP.

  ## Why?

  This module removes the occasional "bad egg" that will slip into SDP when it
  is generated by the browser.  In particular these situations are catered for:

  - invalid ICE candidates

**/
module.exports = function(input, opts) {
  var lineBreak = detectLineBreak(input);
  var lines = input.split(lineBreak);
  var collector = (opts || {}).collector;

  // filter out invalid lines
  lines = lines.filter(function(line) {
    // iterate through the validators and use the one that matches
    var validator = validators.reduce(function(memo, data, idx) {
      return typeof memo != 'undefined' ? memo : (data[0].exec(line) && {
        line: line.replace(data[0], '$1'),
        fn: data[1]
      });
    }, undefined);

    // if we have a validator, ensure we have no errors
    var errors = validator ? validator.fn(validator.line) : [];

    // if we have errors and an error collector, then add to the collector
    if (collector) {
      errors.forEach(function(err) {
        collector.push(err);
      });
    }

    return errors.length === 0;
  });

  return lines.join(lineBreak);
};

function detectLineBreak(input) {
  var match = reSdpLineBreak.exec(input);

  return match && match[0];
}

},{"rtc-validator/candidate":71}],71:[function(require,module,exports){
var debug = require('cog/logger')('rtc-validator');
var rePrefix = /^(?:a=)?candidate:/;

/*

validation rules as per:
http://tools.ietf.org/html/draft-ietf-mmusic-ice-sip-sdp-03#section-8.1

   candidate-attribute   = "candidate" ":" foundation SP component-id SP
                           transport SP
                           priority SP
                           connection-address SP     ;from RFC 4566
                           port         ;port from RFC 4566
                           SP cand-type
                           [SP rel-addr]
                           [SP rel-port]
                           *(SP extension-att-name SP
                                extension-att-value)

   foundation            = 1*32ice-char
   component-id          = 1*5DIGIT
   transport             = "UDP" / transport-extension
   transport-extension   = token              ; from RFC 3261
   priority              = 1*10DIGIT
   cand-type             = "typ" SP candidate-types
   candidate-types       = "host" / "srflx" / "prflx" / "relay" / token
   rel-addr              = "raddr" SP connection-address
   rel-port              = "rport" SP port
   extension-att-name    = token
   extension-att-value   = *VCHAR
   ice-char              = ALPHA / DIGIT / "+" / "/"
*/
var partValidation = [
  [ /.+/, 'invalid foundation component', 'foundation' ],
  [ /\d+/, 'invalid component id', 'component-id' ],
  [ /(UDP|TCP)/i, 'transport must be TCP or UDP', 'transport' ],
  [ /\d+/, 'numeric priority expected', 'priority' ],
  [ require('reu/ip'), 'invalid connection address', 'connection-address' ],
  [ /\d+/, 'invalid connection port', 'connection-port' ],
  [ /typ/, 'Expected "typ" identifier', 'type classifier' ],
  [ /.+/, 'Invalid candidate type specified', 'candidate-type' ]
];

/**
  ### `rtc-validator/candidate`

  Validate that an `RTCIceCandidate` (or plain old object with data, sdpMid,
  etc attributes) is a valid ice candidate.

  Specs reviewed as part of the validation implementation:

  - <http://tools.ietf.org/html/draft-ietf-mmusic-ice-sip-sdp-03#section-8.1>
  - <http://tools.ietf.org/html/rfc5245>

**/
module.exports = function(data) {
  var errors = [];
  var candidate = data && (data.candidate || data);
  var prefixMatch = candidate && rePrefix.exec(candidate);
  var parts = prefixMatch && candidate.slice(prefixMatch[0].length).split(/\s/);

  if (! candidate) {
    return [ new Error('empty candidate') ];
  }

  // check that the prefix matches expected
  if (! prefixMatch) {
    return [ new Error('candidate did not match expected sdp line format') ];
  }

  // perform the part validation
  errors = errors.concat(parts.map(validateParts)).filter(Boolean);

  return errors;
};

function validateParts(part, idx) {
  var validator = partValidation[idx];

  if (validator && (! validator[0].test(part))) {
    debug(validator[2] + ' part failed validation: ' + part);
    return new Error(validator[1]);
  }
}

},{"cog/logger":24,"reu/ip":72}],72:[function(require,module,exports){
/**
  ### `reu/ip`

  A regular expression that will match both IPv4 and IPv6 addresses.  This is a modified
  regex (remove hostname matching) that was implemented by @Mikulas in
  [this stackoverflow answer](http://stackoverflow.com/a/9209720/96656).

**/
module.exports = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$|^(?:(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){6})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:::(?:(?:(?:[0-9a-fA-F]{1,4})):){5})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){4})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,1}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){3})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,2}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:(?:[0-9a-fA-F]{1,4})):){2})(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,3}(?:(?:[0-9a-fA-F]{1,4})))?::(?:(?:[0-9a-fA-F]{1,4})):)(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,4}(?:(?:[0-9a-fA-F]{1,4})))?::)(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9]))\.){3}(?:(?:25[0-5]|(?:[1-9]|1[0-9]|2[0-4])?[0-9])))))))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,5}(?:(?:[0-9a-fA-F]{1,4})))?::)(?:(?:[0-9a-fA-F]{1,4})))|(?:(?:(?:(?:(?:(?:[0-9a-fA-F]{1,4})):){0,6}(?:(?:[0-9a-fA-F]{1,4})))?::))))$/;

},{}],73:[function(require,module,exports){
module.exports = function(a, b) {
  return arguments.length > 1 ? a === b : function(b) {
    return a === b;
  };
};

},{}],74:[function(require,module,exports){
/**
  ## flatten

  Flatten an array using `[].reduce`

  <<< examples/flatten.js

**/

module.exports = function(a, b) {
  // if a is not already an array, make it one
  a = Array.isArray(a) ? a : [a];

  // concat b with a
  return a.concat(b);
};
},{}],75:[function(require,module,exports){
module.exports = function(comparator) {
  return function(input) {
    var output = [];
    for (var ii = 0, count = input.length; ii < count; ii++) {
      var found = false;
      for (var jj = output.length; jj--; ) {
        found = found || comparator(input[ii], output[jj]);
      }

      if (found) {
        continue;
      }

      output[output.length] = input[ii];
    }

    return output;
  };
}
},{}],76:[function(require,module,exports){
/**
  ## nub

  Return only the unique elements of the list.

  <<< examples/nub.js

**/

module.exports = require('./nub-by')(require('./equality'));
},{"./equality":73,"./nub-by":75}],77:[function(require,module,exports){
/**
  ## pluck

  Extract targeted properties from a source object. When a single property
  value is requested, then just that value is returned.

  In the case where multiple properties are requested (in a varargs calling
  style) a new object will be created with the requested properties copied
  across.

  __NOTE:__ In the second form extraction of nested properties is
  not supported.

  <<< examples/pluck.js

**/
module.exports = function() {
  var fields = [];

  function extractor(parts, maxIdx) {
    return function(item) {
      var partIdx = 0;
      var val = item;

      do {
        val = val && val[parts[partIdx++]];
      } while (val && partIdx <= maxIdx);

      return val;
    };
  }

  [].slice.call(arguments).forEach(function(path) {
    var parts = typeof path == 'number' ? [ path ] : (path || '').split('.');

    fields[fields.length] = {
      name: parts[0],
      parts: parts,
      maxIdx: parts.length - 1
    };
  });

  if (fields.length <= 1) {
    return extractor(fields[0].parts, fields[0].maxIdx);
  }
  else {
    return function(item) {
      var data = {};

      for (var ii = 0, len = fields.length; ii < len; ii++) {
        data[fields[ii].name] = extractor([fields[ii].parts[0]], 0)(item);
      }

      return data;
    };
  }
};
},{}],78:[function(require,module,exports){
var detect = require('rtc-core/detect');
var extend = require('cog/extend');
var OPT_DEFAULTS = {
  target: 'rtc.io screenshare'
};

/**
  Returns true if we should use Chrome screensharing
 **/
exports.supported = function() {
  return detect.browser === 'chrome';
}

/**
  Creates the share context.
 **/
exports.share = function(opts) {
  var extension = require('chromex/client')(extend({}, OPT_DEFAULTS, opts, {
    target: (opts || {}).chromeExtension
  }));

  extension.type = 'google/chrome';

  extension.available = function(callback) {
    return extension.satisfies((opts || {}).version, callback);
  };

  // patch in our capture function
  extension.request = function(callback) {
    extension.sendCommand('share', function(err, sourceId) {
      if (err) {
        return callback(err);
      }

      if (! sourceId) {
        return callback(new Error('user rejected screen share request'));
      }

      // pass the constraints through
      return callback(null, extend({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: screen.width,
            maxHeight: screen.height,
            minFrameRate: 1,
            maxFrameRate: 5
          },
          optional: []
        }
      }, opts.constraints));
    });
  };

  extension.cancel = function() {
    extension.sendCommand('cancel', function(err) {
    });
  };

  return extension;
};
},{"chromex/client":81,"cog/extend":88,"rtc-core/detect":90}],79:[function(require,module,exports){
/**
  # rtc-screenshare

  This is module provides a mechanism for integrating with the various
  screen capture APIs exposed by the browser.  The module is designed to
  interact with a browser extension (where required) to generate
  suitable constraints that can be passed onto a `getUserMedia` call.

  ## Example Usage

  <<< examples/share-window.js

  ## Template Extension

  Template extension
  [source is available](https://github.com/rtc-io/rtc-screenshare-extension) and
  an early, installable version of the extension is available in the
  [Chrome Web Store](https://chrome.google.com/webstore/detail/webrtc-screen-sharing-for/einjngigaajacmojcohefgmnhhdnllic).

  __NOTE:__ The extension is not publicly available yet, but using the direct link
  you can install it.

  ## Give it a Try

  We've created a simple demo showing how to broadcast your screen and made it
  available here at <https://rtc.io/screeny/>
  ([source](https://github.com/rtc-io/demo-screenshare)).

**/
module.exports = function() {
  console.error('Screensharing is not supported on this device');
};

var handlers = [require('./chrome'), require('./moz')];
for (var i = 0; i < handlers.length; i++) {
  var handler = handlers[i];
  if (handler && handler.supported()) {
    module.exports = handler.share;
    break;
  }
}
},{"./chrome":78,"./moz":80}],80:[function(require,module,exports){
var detect = require('rtc-core/detect');
var EventEmitter = require('eventemitter3');
var targets = {};

targets.window = function(callback) {
  callback(null, {
    video: {
      mozMediaSource: 'window',
      mediaSource: 'window'
    }
  });
};

/**
  Returns true if we should use Firefox screensharing
 **/
exports.supported = function() {
  return detect.moz;
};

exports.share = function(opts) {
  opts = opts || {};
  var target = opts.target || 'window';
  var capture = targets[target];

  var extension = new EventEmitter();

  extension.type = 'mozilla/firefox';

  extension.available = function(callback) {
    if (typeof capture != 'function') {
      return callback(new Error(target + ' capture not implemented'), 'not-supported');
    }
    return callback();
  };

  extension.request = function(callback) {
    return capture(callback);
  };

  extension.cancel = function(callback) {

  };

  extension.emit('activate');

  return extension;
};
},{"eventemitter3":89,"rtc-core/detect":90}],81:[function(require,module,exports){
var defaults = require('cog/defaults');
var slimver = require('slimver');
var EventEmitter = require('eventemitter3');
var kgo = require('kgo');
var cuid = require('cuid');
var tickInit = Date.now();

module.exports = function(opts) {
  var initDelay = (opts || {}).initDelay || 100;
  var extension = new EventEmitter();
  var pendingCallbacks = {};

  // create some of the function helpers
  var getVersion = sendCommand('version');

  function checkInstalled(callback) {
    return sendCommand('installed', { timeout: 500 }, function(err) {
      callback(err && new Error('extension not installed'));
    });
  }

  function checkSatisfies(range, callback) {
    if (typeof range == 'function') {
      callback = range;
      range = '*';
    }

    kgo
    ('checkInstalled', checkInstalled)
    ('getVersion', getVersion)
    ('checkAvailable', ['checkInstalled', 'getVersion'], function(installed, version) {
      // normalise the version
      version = normalizeVersion(version);

      // check to see if the detected version satisfies the required version
      if (! slimver.satisfies(version, range)) {
        return callback(new Error('Currently installed extension version "' + version + '" does not meet range requirements: ' + range));
      }

      callback(null, version);
    })
    .on('error', callback);
  }

  function handleMessage(evt) {
    var data = evt && evt.data;
    var responseId = data && data.responseId;
    var handler = responseId && pendingCallbacks[responseId];

    console.log('received message: ', evt);

    if (typeof handler == 'function') {
      pendingCallbacks[responseId] = null;

      // if we received an error trigger the error
      if (data.error) {
        return handler(new Error(data.error));
      }

      // if the extension component is sending us all the args, use them
      if (data.args) {
        handler.apply(null, [null].concat(data.args));
      }
      // otherwise, default to using the payload
      else {
        handler(null, data.payload);
      }
    }
    else if (data.message) {
      extension.emit(data.message, data);
    }
  }

  function ready(callback) {
    var diff = Date.now() - tickInit;

    if (diff > initDelay) {
      return callback()
    }

    return setTimeout(callback, initDelay - diff);
  }

  function normalizeVersion(version) {
    var parts = version.split('.');
    while (parts.length < 3) {
      parts.push('0');
    }

    return parts.join('.');
  }

  function sendCommand(command, requestOpts, callback) {
    // create the request id
    var id = cuid();

    function exec(cb) {
      var timeout = (requestOpts || {}).timeout;

      function checkProcessed() {
        if (pendingCallbacks[id]) {
          pendingCallbacks[id] = undefined;
          cb(new Error('command "' + command + '" timed out'));
        }
      }

      ready(function() {
        if (timeout) {
          setTimeout(checkProcessed, timeout);
        }

        // regsiter the pending callback
        pendingCallbacks[id] = cb;
        window.postMessage({
          requestId: id,
          target: (opts || {}).target,
          command: command,
          opts: requestOpts
        }, '*');
      });
    }

    if (typeof requestOpts == 'function') {
      callback = requestOpts;
      requestOpts = undefined;
    }

    return callback ? exec(callback) : exec;
  }

  extension.installed = checkInstalled;
  extension.satisfies = checkSatisfies;
  extension.getVersion = getVersion;
  extension.sendCommand = sendCommand;

  // listen for window messages just like everybody else
  window.addEventListener('message', handleMessage);

  return extension;
};

},{"cog/defaults":87,"cuid":82,"eventemitter3":83,"kgo":84,"slimver":86}],82:[function(require,module,exports){
arguments[4][33][0].apply(exports,arguments)
},{"dup":33}],83:[function(require,module,exports){
'use strict';

/**
 * Representation of a single EventEmitter function.
 *
 * @param {Function} fn Event handler to be called.
 * @param {Mixed} context Context for function execution.
 * @param {Boolean} once Only emit once
 * @api private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() { /* Nothing to set */ }

/**
 * Holds the assigned EventEmitters by name.
 *
 * @type {Object}
 * @private
 */
EventEmitter.prototype._events = undefined;

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @returns {Array}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event) {
  if (!this._events || !this._events[event]) return [];
  if (this._events[event].fn) return [this._events[event].fn];

  for (var i = 0, l = this._events[event].length, ee = new Array(l); i < l; i++) {
    ee[i] = this._events[event][i].fn;
  }

  return ee;
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  if (!this._events || !this._events[event]) return false;

  var listeners = this._events[event]
    , len = arguments.length
    , args
    , i;

  if ('function' === typeof listeners.fn) {
    if (listeners.once) this.removeListener(event, listeners.fn, true);

    switch (len) {
      case 1: return listeners.fn.call(listeners.context), true;
      case 2: return listeners.fn.call(listeners.context, a1), true;
      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    listeners.fn.apply(listeners.context, args);
  } else {
    var length = listeners.length
      , j;

    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  var listener = new EE(fn, context || this);

  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = listener;
  else {
    if (!this._events[event].fn) this._events[event].push(listener);
    else this._events[event] = [
      this._events[event], listener
    ];
  }

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  var listener = new EE(fn, context || this, true);

  if (!this._events) this._events = {};
  if (!this._events[event]) this._events[event] = listener;
  else {
    if (!this._events[event].fn) this._events[event].push(listener);
    else this._events[event] = [
      this._events[event], listener
    ];
  }

  return this;
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @param {Boolean} once Only remove once listeners.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, once) {
  if (!this._events || !this._events[event]) return this;

  var listeners = this._events[event]
    , events = [];

  if (fn) {
    if (listeners.fn && (listeners.fn !== fn || (once && !listeners.once))) {
      events.push(listeners);
    }
    if (!listeners.fn) for (var i = 0, length = listeners.length; i < length; i++) {
      if (listeners[i].fn !== fn || (once && !listeners[i].once)) {
        events.push(listeners[i]);
      }
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) {
    this._events[event] = events.length === 1 ? events[0] : events;
  } else {
    delete this._events[event];
  }

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) delete this._events[event];
  else this._events = {};

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the module.
//
EventEmitter.EventEmitter = EventEmitter;
EventEmitter.EventEmitter2 = EventEmitter;
EventEmitter.EventEmitter3 = EventEmitter;

//
// Expose the module.
//
module.exports = EventEmitter;

},{}],84:[function(require,module,exports){
var run = require('./run'),
    EventEmitter = require('events').EventEmitter;

var defer = typeof setImmediate === 'function' ? setImmediate : setTimeout;

function newKgo(){
    var returnlessId = 0,
        tasks = {},
        results = {},
        inFlight,
        defaultsDefined;

    function kgoFn(){
        if(!arguments.length){
            throw new Error('kgo must must be called with a task or defaults');
        }

        if(inFlight){
            throw new Error('No tasks or defaults may be set after kgo is in flight');
        }

        var argIndex = 0;

        while(typeof arguments[argIndex] === 'string'){
            argIndex++;
        }

        var names = Array.prototype.slice.call(arguments, 0, argIndex),
            dependencies,
            fn;

        if(!names.length){
            names.push((returnlessId++).toString() + '__returnless');
        }

        if(typeof arguments[argIndex] === 'object' && !Array.isArray(arguments[argIndex])){
            var defaults = arguments[argIndex];

            if(defaultsDefined){
                throw  new Error('Defaults may be defined only once per kgo');
            }

            for(var key in defaults){
                if(key in tasks){
                    throw  new Error('A task is already defined for ' + key);
                }
                results[key] = defaults[key];
            }
            defaultsDefined = true;
            return kgoFn;
        }

        if(Array.isArray(arguments[argIndex])){
            dependencies = arguments[argIndex];
            argIndex++;
        }

        if(typeof arguments[argIndex] === 'function'){
            fn = arguments[argIndex];
        }

        if(typeof fn !== 'function'){
            throw new Error('No function provided for task number ' + Object.keys(tasks).length + ' (' + names + ')');
        }

        for(var i = 0; i < names.length; i++){
            if(names[i] in results){
                throw  new Error('A default with the same name as this task (' + names[i] + ') has already been set');
            }
        }

        if(!dependencies){
            dependencies = [];
        }

        dependencies.map(function(dependency){
            if(typeof dependency !== 'string'){
                throw  new Error('dependency was not a string: ' + dependency + ' in task: ' + names);
            }
        });

        names.map(function(name){
            if(name in tasks){
                throw  new Error('A task with the same name (' + name + ') is aready defined');
            }

            tasks[name] = {
                names: names,
                args: dependencies,
                fn: fn
            };
        });

        return kgoFn;
    }

    for(var key in EventEmitter.prototype){
        kgoFn[key] = EventEmitter.prototype[key];
    }

    kgoFn.apply(null, arguments);

    defer(function(){
        inFlight = true;
        run(tasks, results, kgoFn);
    });

    return kgoFn;
}

module.exports = newKgo;
},{"./run":85,"events":93}],85:[function(require,module,exports){
var ignoreDependency = /^\!.+/;

function Step(task, args, done){
    this._task = task;
    this._args = args;
    this._done = done;
}
Step.prototype.run = function(){
    var step = this,
        didError;

    this._task.fn.apply(this, this._args.concat([function(error){
        var result = Array.prototype.slice.call(arguments, 1);
        if(error){
            didError = true;
            step.done(error);
        }else if(!didError){
            step.done(null, result);
        }
    }]));
};
Step.prototype.done = function(error, result){
    if(error){
        return this._done(error);
    }
    this._done(null, result);
};

function runTask(task, results, aboutToRun, done){
    var names = task.names,
        dependants = task.args,
        args = [];

    if(dependants){
        for(var i = 0; i < dependants.length; i++) {
            var dependantName = dependants[i],
                ignore = dependantName.match(ignoreDependency);

            if(ignore){
                dependantName = dependantName.slice(1);
            }

            if(!(dependantName in results)){
                return;
            }

            if(!ignore){
                args.push(results[dependantName]);
            }
        }
    }

    var step = new Step(task, args, function(error, results){
        done(names, error, results);
    });

    aboutToRun(names);
    step.run();
}

function run(tasks, results, emitter){
    var currentTask,
        noMoreTasks = true;

    if(emitter._complete){
        return;
    }

    for(var key in tasks){
        noMoreTasks = false;
        currentTask = tasks[key];

        runTask(
            currentTask,
            results,
            function(names){
                names.map(function(name){
                    delete tasks[name];
                });
            },
            function(names, error, taskResults){
                if(emitter._complete){
                    return;
                }
                if(error){
                    emitter._complete = true;
                    emitter.emit('error', error, names);
                    emitter.emit('complete');
                    return;
                }

                for(var i = 0; i < names.length; i++){
                    results[names[i]] = taskResults[i];
                }

                run(tasks, results, emitter);
            }
        );
    }

    if(noMoreTasks && Object.keys(results).length === emitter._taskCount){
        emitter._complete = true;
        emitter.emit('complete');
    }
}

function cloneAndRun(tasks, results, emitter){
    var todo = {};

    emitter._taskCount = Object.keys(results).length;

    function checkDependencyIsDefined(dependencyName){
        dependencyName = dependencyName.match(/\!?(.*)/)[1];

        if(!(dependencyName in tasks) && !(dependencyName in results)){
            throw  new Error('No task or result has been defined for dependency: ' + dependencyName);
        }
    }

    for(var key in tasks){
        todo[key] = tasks[key];
        emitter._taskCount ++;

        tasks[key].args.map(checkDependencyIsDefined);
    }

    run(todo, results, emitter);
}

module.exports = cloneAndRun;
},{}],86:[function(require,module,exports){
var OFFSET = Math.pow(2, 16);
var MAXSEG = OFFSET - 1;
var MAXVER = Math.pow(OFFSET, 3) - 1;

/**
  # slimver

  An experimental implementation for working with
  [slimver](https://github.com/DamonOehlman/slimver-spec).

  ## Reference

**/

/**
  ### slimver(version)

  Pack a `MAJOR.MINOR.PATCH` version string into a single numeric value.

  <<< examples/pack.js

**/
function slim(version) {
  var parts;

  if (typeof version == 'number') {
    return version;
  }

  parts = Array.isArray(version) ? version : split(version);
  return parts ?
    parts[0] * (OFFSET * OFFSET) + parts[1] * OFFSET + parts[2] :
    null;
}

function compatibleWith(version) {
  var parts = split(version);

  if (! parts) {
    return null;
  }

  return [slim(parts), slim([parts[0], MAXSEG, MAXSEG])];
}

function rangeFromPattern(parts) {
  var low = [].concat(parts);
  var high = [].concat(parts);

  if (! parts) {
    return null;
  }

  while (low.length < 3) {
    low.push(0);
  }

  while (high.length < 3) {
    high.push(MAXSEG);
  }

  return [slim(low), slim(high)];
}

function invert(value) {
  return value === null ? null : MAXVER - value;
}

/**
  ### slimver.range(expression)

  Return a 2-element array for [low, high] range of the version values that
  will satisfy the expression.

  <<< examples/range.js

**/
function range(expression) {
  var firstChar;
  var parts;
  var val;

  if (expression === 'any' || expression == '' || expression === '*') {
    return [0, MAXVER];
  }

  expression = ('' + expression).trim();
  firstChar = expression.charAt(0);

  if (firstChar === '^' || firstChar === '~') {
    return compatibleWith(expression.slice(1));
  }

  // split the string
  parts = expression.split('.').filter(function(part) {
    return !isNaN(+part);
  });

  // if we have exactly 3 parts, then range from and two the low to high value
  if (parts.length === 3) {
    val = slim(parts.join('.'));
    return [val, val];
  }

  return rangeFromPattern(parts);
}

/**
  ### slimver.satisfies(version, rangeExpr)

  Return true if the input version string satisfies the provided range
  expression.

  <<< examples/satisfies.js

**/
function satisfies(version, rangeExpr) {
  var bounds = range(rangeExpr);
  var v = slim(version);

  return v !== null && bounds && v >= bounds[0] && v <= bounds[1];
}

function split(version) {
  var invalid = false;
  var parts;

  if (typeof version == 'number') {
    version = (version | 0) + '.0.0';
  }

  if (! version) {
    return null;
  }

  // extract the parts and convert to numeric values
  parts = ('' + version).split('.').map(function(part) {
    var val = +part;

    invalid = invalid || isNaN(val) || (val >= OFFSET);
    return val;
  });

  // ensure we have enough parts
  while (parts.length < 3) {
    parts.push(0);
  }

  return invalid ? null : parts;
}

/**
  ### slimver.unpack(value)

  Convert a slimver numeric value back to it's `MAJOR.MINOR.PATCH` string format.

  <<< examples/unpack.js

**/
function unpack(value) {
  var parts;

  if (typeof value != 'number') {
    return null;
  }

  parts = new Uint16Array([
    value / OFFSET / OFFSET,
    value / OFFSET,
    value
  ]);

  return parts[0] + '.' + parts[1] + '.' + parts[2];
}

/* exports */

slim.invert = invert;
slim.range = range;
slim.satisfies = satisfies;
slim.unpack = slim.stringify = unpack;

module.exports = slim;

},{}],87:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"dup":20}],88:[function(require,module,exports){
arguments[4][21][0].apply(exports,arguments)
},{"dup":21}],89:[function(require,module,exports){
'use strict';

//
// We store our EE objects in a plain object whose properties are event names.
// If `Object.create(null)` is not supported we prefix the event names with a
// `~` to make sure that the built-in object properties are not overridden or
// used as an attack vector.
// We also assume that `Object.create(null)` is available when the event name
// is an ES6 Symbol.
//
var prefix = typeof Object.create !== 'function' ? '~' : false;

/**
 * Representation of a single EventEmitter function.
 *
 * @param {Function} fn Event handler to be called.
 * @param {Mixed} context Context for function execution.
 * @param {Boolean} once Only emit once
 * @api private
 */
function EE(fn, context, once) {
  this.fn = fn;
  this.context = context;
  this.once = once || false;
}

/**
 * Minimal EventEmitter interface that is molded against the Node.js
 * EventEmitter interface.
 *
 * @constructor
 * @api public
 */
function EventEmitter() { /* Nothing to set */ }

/**
 * Holds the assigned EventEmitters by name.
 *
 * @type {Object}
 * @private
 */
EventEmitter.prototype._events = undefined;

/**
 * Return a list of assigned event listeners.
 *
 * @param {String} event The events that should be listed.
 * @param {Boolean} exists We only need to know if there are listeners.
 * @returns {Array|Boolean}
 * @api public
 */
EventEmitter.prototype.listeners = function listeners(event, exists) {
  var evt = prefix ? prefix + event : event
    , available = this._events && this._events[evt];

  if (exists) return !!available;
  if (!available) return [];
  if (available.fn) return [available.fn];

  for (var i = 0, l = available.length, ee = new Array(l); i < l; i++) {
    ee[i] = available[i].fn;
  }

  return ee;
};

/**
 * Emit an event to all registered event listeners.
 *
 * @param {String} event The name of the event.
 * @returns {Boolean} Indication if we've emitted an event.
 * @api public
 */
EventEmitter.prototype.emit = function emit(event, a1, a2, a3, a4, a5) {
  var evt = prefix ? prefix + event : event;

  if (!this._events || !this._events[evt]) return false;

  var listeners = this._events[evt]
    , len = arguments.length
    , args
    , i;

  if ('function' === typeof listeners.fn) {
    if (listeners.once) this.removeListener(event, listeners.fn, undefined, true);

    switch (len) {
      case 1: return listeners.fn.call(listeners.context), true;
      case 2: return listeners.fn.call(listeners.context, a1), true;
      case 3: return listeners.fn.call(listeners.context, a1, a2), true;
      case 4: return listeners.fn.call(listeners.context, a1, a2, a3), true;
      case 5: return listeners.fn.call(listeners.context, a1, a2, a3, a4), true;
      case 6: return listeners.fn.call(listeners.context, a1, a2, a3, a4, a5), true;
    }

    for (i = 1, args = new Array(len -1); i < len; i++) {
      args[i - 1] = arguments[i];
    }

    listeners.fn.apply(listeners.context, args);
  } else {
    var length = listeners.length
      , j;

    for (i = 0; i < length; i++) {
      if (listeners[i].once) this.removeListener(event, listeners[i].fn, undefined, true);

      switch (len) {
        case 1: listeners[i].fn.call(listeners[i].context); break;
        case 2: listeners[i].fn.call(listeners[i].context, a1); break;
        case 3: listeners[i].fn.call(listeners[i].context, a1, a2); break;
        default:
          if (!args) for (j = 1, args = new Array(len -1); j < len; j++) {
            args[j - 1] = arguments[j];
          }

          listeners[i].fn.apply(listeners[i].context, args);
      }
    }
  }

  return true;
};

/**
 * Register a new EventListener for the given event.
 *
 * @param {String} event Name of the event.
 * @param {Functon} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.on = function on(event, fn, context) {
  var listener = new EE(fn, context || this)
    , evt = prefix ? prefix + event : event;

  if (!this._events) this._events = prefix ? {} : Object.create(null);
  if (!this._events[evt]) this._events[evt] = listener;
  else {
    if (!this._events[evt].fn) this._events[evt].push(listener);
    else this._events[evt] = [
      this._events[evt], listener
    ];
  }

  return this;
};

/**
 * Add an EventListener that's only called once.
 *
 * @param {String} event Name of the event.
 * @param {Function} fn Callback function.
 * @param {Mixed} context The context of the function.
 * @api public
 */
EventEmitter.prototype.once = function once(event, fn, context) {
  var listener = new EE(fn, context || this, true)
    , evt = prefix ? prefix + event : event;

  if (!this._events) this._events = prefix ? {} : Object.create(null);
  if (!this._events[evt]) this._events[evt] = listener;
  else {
    if (!this._events[evt].fn) this._events[evt].push(listener);
    else this._events[evt] = [
      this._events[evt], listener
    ];
  }

  return this;
};

/**
 * Remove event listeners.
 *
 * @param {String} event The event we want to remove.
 * @param {Function} fn The listener that we need to find.
 * @param {Mixed} context Only remove listeners matching this context.
 * @param {Boolean} once Only remove once listeners.
 * @api public
 */
EventEmitter.prototype.removeListener = function removeListener(event, fn, context, once) {
  var evt = prefix ? prefix + event : event;

  if (!this._events || !this._events[evt]) return this;

  var listeners = this._events[evt]
    , events = [];

  if (fn) {
    if (listeners.fn) {
      if (
           listeners.fn !== fn
        || (once && !listeners.once)
        || (context && listeners.context !== context)
      ) {
        events.push(listeners);
      }
    } else {
      for (var i = 0, length = listeners.length; i < length; i++) {
        if (
             listeners[i].fn !== fn
          || (once && !listeners[i].once)
          || (context && listeners[i].context !== context)
        ) {
          events.push(listeners[i]);
        }
      }
    }
  }

  //
  // Reset the array, or remove it completely if we have no more listeners.
  //
  if (events.length) {
    this._events[evt] = events.length === 1 ? events[0] : events;
  } else {
    delete this._events[evt];
  }

  return this;
};

/**
 * Remove all listeners or only the listeners for the specified event.
 *
 * @param {String} event The event want to remove all listeners for.
 * @api public
 */
EventEmitter.prototype.removeAllListeners = function removeAllListeners(event) {
  if (!this._events) return this;

  if (event) delete this._events[prefix ? prefix + event : event];
  else this._events = prefix ? {} : Object.create(null);

  return this;
};

//
// Alias methods names because people roll like that.
//
EventEmitter.prototype.off = EventEmitter.prototype.removeListener;
EventEmitter.prototype.addListener = EventEmitter.prototype.on;

//
// This function doesn't apply anymore.
//
EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

//
// Expose the prefix.
//
EventEmitter.prefixed = prefix;

//
// Expose the module.
//
if ('undefined' !== typeof module) {
  module.exports = EventEmitter;
}

},{}],90:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"detect-browser":91,"dup":27}],91:[function(require,module,exports){
arguments[4][29][0].apply(exports,arguments)
},{"dup":29}],92:[function(require,module,exports){

},{}],93:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],94:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}]},{},[1]);
