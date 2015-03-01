# rtc.io screenshare demo (screeny)

This is a fairly simple demo that shows how you can use the [`rtc-screenshare`](https://github.com/rtc-io/rtc-screenshare) package to share your screen with a remote participant.

## Running the Demo Locally

### Preparation

First, clone this repository:

```
git clone https://github.com/rtc-io/demo-screenshare.git
```

Next install dependencies:

```
cd demo-screenshare
npm install
```

Now, install some additional command-line tools that will help us during development:

```
npm install browserify beefy st -g
```

OK, here's where it all get's a bit tricky as we have two requirements at this point before running the demo:

1. We need to be running our local demo from HTTPS for screensharing to be permitted in Chrome.
2. For the extension [inline installation](https://developer.chrome.com/webstore/inline_installation) to work, we need to access the demo server as a `*.rtc.io` site.

If you are using nginx on your local machine you can use [this gist](https://gist.github.com/DamonOehlman/dfe879ce2e282a86bc80) to help configure your local nginx server to proxy HTTPS traffic to local HTTP servers on various ports.  You will also need to generate a self-signed certificate for your nginx server.  Instructions on how to do that are beyond the scope of this README, but well documented already so you should be able to find something.

Configuring the host entry is super simple, and simply involves modifying what is likely the first line of your `/etc/hosts` file to something like what is shown below:

```
127.0.0.1	localhost local.rtc.io
```

### Running the Demo

If you have completed the prep, then you should be able to run the following command to run the demo locally:

```
npm run start
```

This runs [this script](https://github.com/rtc-io/demo-screenshare/blob/gh-pages/package.json#L8) as specified in the package.json file.  What is happening here is we are using [beefy](https://github.com/chrisdickinson/beefy) to run a small development server which makes working with [browserify](https://github.com/substack/node-browserify) very, very nice in a local environment.

If you have set your nginx configuration up similar to mine, then you should be able to access the demo on either of the following urls:

- <https://localhost/9966/> (using the magical port proxy rules)
- <https://localhost/> (using the default proxy rule)

### Preparing for Deployment

Once you have modified the code to suit your specific needs, then you are ready to package this up for deployment.  At this point `beefy` is no longer useful as we need a concrete `bundle.js` file that can be used to statically serve our application code.  This is created super simply with the following command:

```
npm run bundle
```

At this point you should now have a `bundle.js` file in your local directory that is ready to be pushed to a server somewhere.

## TODO: Build your own extension

At this stage, while you can deploy your code to the internet somewhere you will need to make your own version of [rtc-screenshare extension](https://github.com/rtc-io/rtc-screenshare/tree/master/extension/src) that is valid for your own domain.  This does require a bit of work, and will be documented in detail somewhere soon.
