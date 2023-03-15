import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [request, setRequest] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [serverURL, setServerURL] = useState('https://c95f-128-12-122-3.ngrok.io');
  const [devMode, setDevMode] = useState(false);
  const [summary, setSummary] = useState('');
  const [callInProgress, setCallInProgress] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dev = urlParams.get('dev');
    if (dev === 'true') {
      setDevMode(true);
    }
  }, []);


  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const response = await fetch(serverURL + "/get-summary", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
  
        if (response.ok) {
          const data = await response.text();
          setSummary(data);
        } else {
          console.error("Response Not Ok", response.statusText);
        }
      } catch (error) {
        console.error("Fetch Failed", error);
      }
    };

    const interval = setInterval(() => {
      fetchSummary();
    }, 5000); // Fetch summary every 5 seconds

    return () => clearInterval(interval);
  }, [serverURL]);


  const handleRequestChange = (event) => {
    setRequest(event.target.value);
  };

  const handlePhoneNumberChange = (event) => {
    setPhoneNumber(event.target.value);
  };

  const handleServerURLChange = (event) => {
    setServerURL(event.target.value);
  };

  const handleRunButtonClicked = () => {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: request, to: phoneNumber })
    };
    fetch(serverURL + "/make-call", requestOptions)
      .catch(error => console.error(error));
    console.log('Request sent with request: ' + request + ' and phone number: ' + phoneNumber);
    setCallInProgress(true);
  };

  return (
    <div className="App">
      <h1 className="title">Treble</h1>
      <p className="description">Treble is a recreation of Google Duplex, first unveiled at Google I/O 2018. To use, type 
        a request into the text field below, as well as a number to call in order to complete the request. Then, after you 
        press 'call now', Treble will then make a call and have a conversation
         with the respondant to accomplish your initial request.
      </p>
      <div className="requestContainer">
        <textarea
          className="request"
          placeholder="Type a request here..."
          value={request}
          onChange={handleRequestChange}
        ></textarea>
      </div>
      {devMode && (
        <div className="serverURLContainer">
          <input
            type="text"
            name="serverURL"
            className="serverURL-input"
            placeholder="Custom server URL"
            value={serverURL}
            onChange={handleServerURLChange}
          />
        </div>
      )}
      <div className="phoneContainer">
        <input
          type="tel"
          name="phone"
          className="phone-input"
          placeholder="+0123456789"
          value={phoneNumber}
          onChange={handlePhoneNumberChange}
        />
        <button className={`runButton${callInProgress ? " callInProgress" : ""}`} onClick={handleRunButtonClicked}>
          Call Now
        </button>
      </div>
      <div className="summaryContainer">
          <pre className="summary">{summary}</pre>
      </div>
    </div>
  );
}

export default App;

