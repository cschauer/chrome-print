const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const fs = require('fs-extra');
const CDP = require('chrome-remote-interface');
const Promise = require('bluebird');

const cdpHost = process.env.CHROME_HEADLESS_PORT_9222_TCP_ADDR || 'localhost';
const cdpPort = process.env.CHROME_HEADLESS_PORT_9222_TCP_PORT || '9222';

function print({
  url,
  format = 'png',
  width = 8.5,
  height = 11,
  delay = 300,
  userAgent = null,
  full = false
}) {

  // Set up viewport resolution, etc.
  const deviceMetrics = {
    width,
    height,
    deviceScaleFactor: 0,
    mobile: false,
    fitWindow: false,
  };

  let client;
  return CDP.New({host: cdpHost, port: cdpPort})
    .then(target => CDP({target, host: cdpHost, port: cdpPort}))
    .then(c => {
      client = c;

      // Enable events on domains we are interested in.
      return Promise.all([
        client.Page.enable(),
        client.DOM.enable(),
        client.Network.enable(),
      ]);
    })
    .then(() => client.Emulation.setDeviceMetricsOverride(deviceMetrics))
    .then(() => client.Emulation.setVisibleSize({width, height}))
    .then(() => client.Page.navigate({url}))
    .then(() => client.Page.loadEventFired())
    .then(() => Promise.delay(delay))
    .then(() => client.Page.printToPDF({
      paperWidth: width,
      paperHeight: height,

      scale: 1,
      // landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      pageRanges: '1-1',
    }))
    .then((screenshot) => {
      const buffer = new Buffer(screenshot.data, 'base64');
      client.close();
      return buffer;
    });
}

const app = express();

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(fileUpload());

app.get('/', (req, res) => {
  res.type('text/plain').send(`Here's a nice curl example of the api:
curl -F "htmlFile=@test.html" -F "width=8.5" -F "height=11" -X POST -H "Content-Type: multipart/form-data" -o result.pdf http://thisurl/
    `);
});

app.post('/', (req, res) => {
  const width = req.body.width ? parseInt(req.body.width, 10) : undefined;
  const height = req.body.height ? parseInt(req.body.height, 10) : undefined;
  const delay = req.body.delay ? parseInt(req.body.delay, 10) : undefined;
  const filename = req.body.filename;

  print({
    width,
    height,
    delay,
    url: `file:///printfiles/${filename}`
  }).then((data) => {
    res.status(200).type('application/pdf').send(data);
    fs.remove(`/printfiles/${filename}`);
  }).catch((e) => {
    console.log(e);
    res.status(500).send('some kind of failure');
  });
});

app.listen(process.env.NODE_PORT || 8888);
