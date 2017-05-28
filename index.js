//This is still work in progress
/*
Please report any bugs to nicomwaks@gmail.com

i have added console.log on line 48
 */
'use strict'

const express = require('express')
const bodyParser = require('body-parser')
const request = require('request')
const app = express()
const Wit = require('node-wit').Wit;
const log = require('node-wit').log;
const TelegramBot = require('node-telegram-bot-api');

const WIT_TOKEN = process.env.WIT_TOKEN;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;


// ----------------------------------------------------------------------------
// Wit.ai bot specific code

// This will contain all user sessions.
// Each session has an entry:
// sessionId -> {fbid: facebookUserId, context: sessionState}
const sessions = {};

const findOrCreateSession = ({id}) => {
  let sessionId;
  // Let's see if we already have a session for the user fbid
  Object.keys(sessions).forEach(k => {
    if (sessions[k].fbid === id) {
      // Yep, got it!
      sessionId = k;
    }
  });
  if (!sessionId) {
    // No session found for user fbid, let's create a new one
    sessionId = new Date().toISOString();
    sessions[sessionId] = {fbid: id, context: { id }};
  }
  return sessionId;
};

// Our bot actions
const actions = {
  send({sessionId}, {text}) {
    // Our bot has something to say!
    // Let's retrieve the Facebook user whose session belongs to
    const recipientId = sessions[sessionId].fbid;
    if (recipientId) {
      // Yay, we found our recipient!
      // Let's forward our bot response to her.
      // We return a promise to let our bot know when we're done sending
      return fbMessage(recipientId, text)
      .then(() => null)
      .catch((err) => {
        console.error(
          'Oops! An error occurred while forwarding the response to',
          recipientId,
          ':',
          err.stack || err
        );
      });
    } else {
      console.error('Oops! Couldn\'t find user for session:', sessionId);
      // Giving the wheel back to our bot
      return Promise.resolve()
    }
  },
  // You should implement your custom actions here
  // See https://wit.ai/docs/quickstart
  sendPoints({sessionId, context : ctx, entities}) {
	  const {number, context, contact, reason} = entities;
	return getFacebookUserData(ctx.id)
	.then(data => sendPoints(data.first_name, extractFromWIT(contact), extractFromWIT(number), extractFromWIT(context), extractFromWIT(reason)))
	.then(spreadsheet => new Promise((resolve, reject) => spreadsheet.updates.updatedRows ? resolve(context) : reject({ err: 'no update' })));
  }
};

const extractFromWIT = (prop, index = 0) => prop && prop.length && prop[index] && prop[index].value;

const wit = new Wit({
  accessToken: WIT_TOKEN,
  actions,
  logger: new log.Logger(log.INFO)
});

// ----------------------------------------------------------------------------
// Google spreadsheets

var google = require('googleapis');
var sheets = google.sheets('v4');

const sendPoints = (sender, receiver, points, context, reason) => authorize().then(function(authClient) {
	console.log('sendpoints', sender, receiver, points, context, reason);

  var request = {
    // The ID of the spreadsheet to update.
    spreadsheetId: '1TY8iJeW496RRrPFwI8lfB5XHMxcFvbjsOrvIZ1YMq1s',  // TODO: Update placeholder value.

    // The A1 notation of a range to search for a logical table of data.
    // Values will be appended after the last row of the table.
    range: 'b1:f9999',  // TODO: Update placeholder value.

    // How the input data should be interpreted.
    valueInputOption: 'RAW',  // TODO: Update placeholder value.

    resource: {
      values: [
		  [new Date(), sender, receiver, points, context, reason]
	  ]
    },

    auth: authClient
  };

  return new Promise((resolve, reject) => {
	sheets.spreadsheets.values.append(request, function(err, response) {
		if (err) {
		console.log(err);
		reject(err);
		return;
		}

		// TODO: Change code below to process the `response` object:
		console.log(JSON.stringify(response, null, 2));
		resolve(response);
	});
  });
});

const GoogleAuth = require('google-auth-library');

function authorize() {
  // TODO: Change placeholder below to generate authentication credentials. See
  // https://developers.google.com/sheets/quickstart/nodejs#step_3_set_up_the_sample
  //
  // Authorize using one of the following scopes:
  //   'https://www.googleapis.com/auth/drive'
  //   'https://www.googleapis.com/auth/spreadsheets'
  return new Promise(resolve => {
	const { private_key, client_email } = JSON.parse(process.env.GOOGLE_AUTH);

	const authFactory = new GoogleAuth();
	const jwtClient = new authFactory.JWT(
		client_email, // defined in Heroku
		null,
		private_key, // defined in Heroku
		['https://www.googleapis.com/auth/drive','https://www.googleapis.com/auth/drive.file','https://www.googleapis.com/auth/spreadsheets']
	);

	jwtClient.authorize(() => resolve(jwtClient));
  });
}

// ----------------------------------------------------------------------------
// Telegram
const bot = new TelegramBot(TELEGRAM_TOKEN);
// Heroku routes from port :443 to $PORT
// Add URL of your app to env variable or enable Dyno Metadata
// to get this automatically
// See: https://devcenter.heroku.com/articles/dyno-metadata
const url = process.env.APP_URL || 'https://pointwarts.herokuapp.com:443';

bot.setWebHook(`${url}/bot${TELEGRAM_TOKEN}`);

app.post(`/bot${TELEGRAM_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  console.log('mensagem do bot:', msg);
  bot.sendMessage(chatId, JSON.stringify(msg));

  // wit.runActions(
  //   sessionId, // the user's current session
  //   text, // the user's message
  //   sessions[sessionId].context // the user's current session state
  // ).then((context) => {
  //   // Our bot did everything it has to do.
  //   // Now it's waiting for further messages to proceed.
  //   console.log('Waiting for next user messages');

  //   // Based on the session state, you might want to reset the session.
  //   // This depends heavily on the business logic of your bot.
  //   // Example:
  //   // if (context['done']) {
  //   //   delete sessions[sessionId];
  //   // }

  //   // Updating the user's current session state
  //   sessions[sessionId].context = context;
  //   // send a message to the chat acknowledging receipt of their message
  //   bot.sendMessage(chatId, 'Received your message');
  // })
  // .catch((err) => {
  //   console.error('Oops! Got an error from Wit: ', err.stack || err);
  // })
});


// ----------------------------------------------------------------------------
// Server

app.set('port', (process.env.PORT || 5000))

// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// parse application/json
app.use(bodyParser.json())

// index
app.get('/', function (req, res) {
	res.send('hello world i am a secret bot')
})

app.get('/test-spreadsheet', (req, res) => {
	sendPoints(1, 2, 3, 4, 5).then((d) => res.send(d));
});

// for facebook verification
app.get('/webhook/', function (req, res) {
	if (req.query['hub.verify_token'] === process.env.FB_PAGE_VERIFY_TOKEN) {
		res.send(req.query['hub.challenge'])
	} else {
		res.send('Error, wrong token')
	}
})

const fbMessage = (id, text) => {
  const body = JSON.stringify({
    recipient: { id },
    message: { text },
  });
  const qs = 'access_token=' + encodeURIComponent(process.env.FB_PAGE_TOKEN);
  return fetch('https://graph.facebook.com/me/messages?' + qs, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body,
  })
  .then(rsp => rsp.json())
  .then(json => {
    if (json.error && json.error.message) {
      throw new Error(json.error.message);
    }
    return json;
  });
};


// to post data
app.post('/webhook', (req, res) => {
  // Parse the Messenger payload
  // See the Webhook reference
  // https://developers.facebook.com/docs/messenger-platform/webhook-reference
  const data = req.body;

  if (data.object === 'page') {
    data.entry.forEach(entry => {
      entry.messaging.forEach(event => {
        if (event.message && !event.message.is_echo) {
			console.log('event', event)

          // Yay! We got a new message!
          // We retrieve the Facebook user ID of the sender
          const sender = event.sender;

          // We retrieve the user's current session, or create one if it doesn't exist
          // This is needed for our bot to figure out the conversation history
          const sessionId = findOrCreateSession(sender);

          // We retrieve the message content
          const {text, attachments} = event.message;

          if (attachments) {
            // We received an attachment
            // Let's reply with an automatic message
            fbMessage(sender, 'Sorry I can only process text messages for now.')
            .catch(console.error);
          } else if (text) {
            // We received a text message

            // Let's forward the message to the Wit.ai Bot Engine
            // This will run all actions until our bot has nothing left to do
            wit.runActions(
              sessionId, // the user's current session
              text, // the user's message
              sessions[sessionId].context // the user's current session state
            ).then((context) => {
              // Our bot did everything it has to do.
              // Now it's waiting for further messages to proceed.
              console.log('Waiting for next user messages');

              // Based on the session state, you might want to reset the session.
              // This depends heavily on the business logic of your bot.
              // Example:
              // if (context['done']) {
              //   delete sessions[sessionId];
              // }

              // Updating the user's current session state
              sessions[sessionId].context = context;
            })
            .catch((err) => {
              console.error('Oops! Got an error from Wit: ', err.stack || err);
            })
          }
        } else {
          console.log('received event', JSON.stringify(event));
        }
      });
    });
  }
  res.sendStatus(200);
});

app.get('/fbd', (req, res) => {
	getFacebookUserData('1352952438092065').then(data => res.write(JSON.stringify(data)))
});


// recommended to inject access tokens as environmental variables, e.g.
// const token = process.env.FB_PAGE_ACCESS_TOKEN

function sendTextMessage(sender, text) {
	let messageData = { text:text }

	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:process.env.FB_PAGE_ACCESS_TOKEN},
		method: 'POST',
		json: {
			recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending messages: ', error)
		} else if (response.body.error) {
			console.log('Error: ', response.body.error)
		}
	})
}

function getFacebookUserData(fbId) {
	return new Promise((resolve, reject) => request({
		url: `https://graph.facebook.com/v2.9/${fbId}`,
		qs: {
			access_token: process.env.FB_PAGE_TOKEN,
			fields: 'first_name'
		},
		json: true
	}, (error, response) => console.log('getfacebookdata', response.body) || error ? reject(error) : resolve(response.body)));
}

function sendGenericMessage(sender) {
	let messageData = {
		"attachment": {
			"type": "template",
			"payload": {
				"template_type": "generic",
				"elements": [{
					"title": "First card",
					"subtitle": "Element #1 of an hscroll",
					"image_url": "http://messengerdemo.parseapp.com/img/rift.png",
					"buttons": [{
						"type": "web_url",
						"url": "https://www.messenger.com",
						"title": "web url"
					}, {
						"type": "postback",
						"title": "Postback",
						"payload": "Payload for first element in a generic bubble",
					}],
				}, {
					"title": "Second card",
					"subtitle": "Element #2 of an hscroll",
					"image_url": "http://messengerdemo.parseapp.com/img/gearvr.png",
					"buttons": [{
						"type": "postback",
						"title": "Postback",
						"payload": "Payload for second element in a generic bubble",
					}],
				}]
			}
		}
	}
	request({
		url: 'https://graph.facebook.com/v2.6/me/messages',
		qs: {access_token:token},
		method: 'POST',
		json: {
			recipient: {id:sender},
			message: messageData,
		}
	}, function(error, response, body) {
		if (error) {
			console.log('Error sending messages: ', error)
		} else if (response.body.error) {
			console.log('Error: ', response.body.error)
		}
	})
}

// spin spin sugar
app.listen(app.get('port'), function() {
	console.log('running on port', app.get('port'))
})
