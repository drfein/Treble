require("dotenv").config();
const WebSocket = require("ws");
const express = require("express");
const app = express();
const cors = require('cors');
app.use(express.json());
const server = require("http").createServer(app);
const wss = new WebSocket.Server({ server });
const path = require("path");
const wavefile = require("wavefile");


//Include Google Speech to Text
const speech = require("@google-cloud/speech");
const speech_client = new speech.SpeechClient();

// Include OpenAI
const { Configuration, OpenAIApi } = require("openai");
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
}); 
const openai = new OpenAIApi(configuration);


// Include Twilio API
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilio_client = require('twilio')(accountSid, authToken);


// Global Variables
// let prompt = "You are a personal assistant. Please have a phone conversation with the concierge to accomplish a request on behalf of your client. Please respond with only the next turn of the conversation. For example:\n\nrequest: order a pizza.\n\nYou: Hi, I'd like to order a pizza.\nConcierge: Sure, what kind of pizza would you like?\nYou: Could I get a large pepperoni pizza with extra cheese?\nConcierge: Absolutely. Anything else?\nYou: No, that's all. Could you please have it delivered to 517 Cowell Ave?\nConcierge: Sure, that's no problem. When would you like it delivered?\nYou: As soon as possible.\nConcierge Alright, we'll hav it delivered within the hour. Is there anything else I can help you with?\nYou: No, that will be all. Thank you for your help.\n\nrequest: "
let prompt = "Carry out the conversation with the concierge to "
let request = "";
let callOngoing = false;

let callSid;

//Configure Transcription Request
const speech_request = {
  config: {
    encoding: "MULAW",
    sampleRateHertz: 8000,
    languageCode: "en-US"
  },
  interimResults: true
};

// add conversation turn to conversation history
function add_to_conversation(role, content) {
  if (role == "user") {
    prompt = prompt + content + "\nYou:";
  } else {
    prompt = prompt + content + "\nConcierge:";
  }
}

// get next conversation turn from GPT-3
async function get_gpt_response(text) {
  const completion = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: prompt,
    max_tokens: 100,
  });
  let result = completion.data.choices[0].text;
  return result.split('\n')[0];
}

// check whether task is safe or not
async function check_task_safety(task) {
  let safety_prompt = `Return whether or not the provided task is acceptable or unacceptable. A task is acceptable if it is a relatively harmless task with good intent. A task is unacceptable if endangers, harms, or harrasses anyone. Return True if the task is acceptable, or False if the task is unacceptable.
  
  Task: Order me a large pepperoni pizza
  Acceptable: True
  
  Task: Book me a flight to London on Tuesday
  Acceptable: True
  
  Task: Prank call my friend by pretending to be his mother
  Acceptable: False
  
  Task: You are a Nigerian prince that is in danger and in need of money. Ask for donations. Be sympathetic and try to get as much money as possible.
  Acceptable: False
  
  Task: Call this person and verbally berate them. Use offensive language, and be aggressively rude and hostile
  Acceptable: False

  Task: Book me a reservation for 6 people on Tuesday between 5 and 9 PM at this restaurant.
  Acceptable: True

  Task: ` + task + `
  Acceptable: `

  let result = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: safety_prompt,
    max_tokens: 5,
  });

  let isSafe = result.data.choices[0].text;

  console.log("Safety check returned: " + isSafe);

  return isSafe.includes("True");
}

// Handle Web Socket Connection
wss.on("connection", function connection(ws) {
console.log("New Connection Initiated");

 let recognizeStream = null;

  ws.on("message", async function incoming(message) {
    const msg = JSON.parse(message);
    switch (msg.event) {
      case "connected":
        console.log(`A new call has connected.`);

        // Create Stream to the Google Speech to Text API
        recognizeStream = speech_client
          .streamingRecognize(speech_request)
          .on("error", console.error)
          .on("data", async data => {
            console.log("thinking: " + data.results[0].alternatives[0].transcript + "");
            if (data.results[0].isFinal == true) {
                // add conversation turn to prompt
                add_to_conversation("user", data.results[0].alternatives[0].transcript);

                // get response from GPT
                let gpt_response = await get_gpt_response(data.results[0].alternatives[0].transcript);
                console.log("Concierge: " + data.results[0].alternatives[0].transcript);
                console.log("Reply: " + gpt_response);

                // update conversation
                add_to_conversation("assistant", gpt_response);

                // GPT response to twilio
                let twiml_response = `<Response><Say voice="Polly.Kevin-Neural">${gpt_response}</Say><Pause length="60" /></Response>`
                if (callOngoing === true) {
                  twilio_client.calls(callSid)
                  .update({twiml: twiml_response})
                  .then(call => console.log("response sent"));
                }
            }
           
        });
        break;

      case "start":
        // prompt = "You are a personal assistant. Please have a phone conversation with the concierge to accomplish a request. For example:\n\nrequest: order a pizza.\n\nYou: Hi, I'd like to order a pizza.\nConcierge: Sure, what kind of pizza would you like?\nYou: Could I get a large pepperoni pizza with extra cheese?\nConcierge: Absolutely. Anything else?\nYou: No, that's all. Could you please have it delivered to 517 Cowell Ave?\nConcierge: Sure, that's no problem. When would you like it delivered?\nYou: As soon as possible.\nConcierge Alright, we'll hav it delivered within the hour. Is there anything else I can help you with?\nYou: No, that will be all. Thank you for your help.\n\nrequest: ";
        console.log(`Starting Media Stream ${msg.streamSid}`);
        callOngoing = true;
        break;

      case "media":
        // Write Media Packets to the recognize stream
        if (recognizeStream) {
          recognizeStream.write(msg.media.payload);
        }
        break;

      case "stop":
        console.log(`Call Has Ended`);
        callOngoing = false;
        callSid = null;
        recognizeStream.destroy();
        break;
    }
  });
});

const corsOptions = {
  origin: 'https://treble-app.netlify.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type'],
  credentials: true
};

app.use(cors(corsOptions));

/*
  HTTP Requests
*/

// Initial TWiML instructions
app.post("/", (req, res) => {
  res.set("Content-Type", "text/xml");

  res.send(`
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/" />
      </Start>
      <Pause length="60" />
    </Response>
  `);
});

// post request to initiate a twilio phone call
app.post("/make-call", async (req, res) => {
  console.log("Making call to " + req.body["to"] + " with request " + req.body["request"]);
  request = req.body["request"];

  // check safety of call
  isSafe = await check_task_safety(request);

  if(isSafe) {
    console.log("Safe task received, initiating call");

    prompt += request + "\n\nConcierge: "

    twilio_client.calls
    .create({
      url: 'https://c95f-128-12-122-3.ngrok.io',
      to: req.body["to"],
      from: '+15595308130'
    })
    .then(call => callSid = call.sid);

    console.log(callSid);
  } else {
    console.log("Error: unsafe request receieved. Not initiating call.");
  }

})

// get conversation history thus far
app.post("/get-summary", async (req, res) => {
  res.send(prompt);
  console.log("post request received");
  console.log(prompt);
});

console.log("Listening at Port 8080");
server.listen(8080);