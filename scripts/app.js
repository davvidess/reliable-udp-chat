//window.onload = function(){
/*
** Requires for modules
*/
const electron = require('electron');
const  path = require('path');
const crc32 = require('buffer-crc32');
const dgram = require('dgram');
const fs = require('fs');
const ip = require('ip');
const remote = electron.remote;

/* 
** ENUMS
*/
const SIZE = {
	HEADER: 9,
	SEQ_NUM: 2,
	CODE_NUM: 1,
	CRC: 4,
	MIN_DATAGRAM: 18
};

const OFFSET = {
	CRC: 0,
	SEQ_NUM: 4,
	ACK_NUM: 6,
	CODE: 8,
	PAYLOAD: 9
};

const CODE = {
    MESSAGE: 0,
    END_OF_MESSAGE: 1,
    FILE: 2,
    END_OF_FILE: 3,
    START_CONN_REQUEST: 4,
    START_CONN_ACCEPT: 5,
    KEEP_CONN_REQUEST: 6,
    KEEP_CONN_ACCEPT: 7,
    TERMINATE_CONN_REQUEST: 8,
    TERMINATE_CONN_ACCEPT: 9,
    ACK: 255
};
 
 /*
** Constants and Variables
*/
const RESEND_TIMEOUT = 2000;
const KEEP_ALIVE_RESEND = 45000;
const MAX_RESEND_ATTEMPTS = 5;
const MAX_SEQUENCE_NUMBER = 65535;

var acceptTimeout;
var ackReceived = null;
var chat = '';
var info = '';
var choosedFile;
var currentBuffer;
var receivedFile;
var errorFragment;
var hostIP;
var hostPort;
var keepAliveTimer;
var lastSeqNum = null;
var myIP;
var myPort;
var socket;
var timeoutID;
var receivedFileName;

/*
** References to HTML DOM elements
*/
var cancelBtn = document.getElementById("cancelBtn");
var chatField = document.getElementById("chat");
var infoField = document.getElementById("info");
var connectBtn = document.getElementById("connectBtn");
var fragmentSizeBox = document.getElementById("fragments");
var errFragBox = document.getElementById("err-num");
var listenForConnectionBtn = document.getElementById("listenForConnectionBtn");
var messageBox = document.getElementById("messageBox");
var okBtn = document.getElementById("okBtn");
var dialog = document.getElementById("dialog");
var dialogForm = document.getElementById("dialog-form");
var sendBtn = document.getElementById("sendBtn");
var stateLbl = document.getElementById('state-lbl');
var choosedFileBtn = document.getElementById('choose-file'); 


/*
** resend timeout utility
*/
function ResendTimeout(func, interval) {
    var id = setTimeout(func, interval);

    this.clearAndFire = function(){
        clearTimeout(id);
        func();
    };
}

function resetKeepAliveTimer(){
	clearInterval(keepAliveTimer);
	keepAliveTimer = setInterval(send, KEEP_ALIVE_RESEND, CODE.KEEP_CONN_REQUEST);
}

function connectionDialog(){
	
	//fs.readFile('./resources/app.asar/connectDialog.html', function (err, data) {
	fs.readFile('template/connectDialog.html', function (err, data) {
	  if (err) throw err;
	   dialog.innerHTML = data;
	   document.getElementById("my-ip-box").value = ip.address();
	   document.getElementById("host-ip-box").value = ip.address();

	   okBtn.removeEventListener('click', okBtnStartListener);
	   okBtn.addEventListener('click', okBtnConnectListener);

	   dialogForm.style.display = 'block';
	   document.getElementById("my-ip-box").focus();
	});
}

function listenForConnectionDialog(){
	//fs.readFile('./resources/app.asar/hostDialog.html', function (err, data) {
	fs.readFile('template/hostDialog.html', function (err, data) {
	  if (err) throw err;
		dialog.innerHTML = data;
		document.getElementById("my-ip-box").value = ip.address();

	    okBtn.removeEventListener('click', okBtnConnectListener);
	    okBtn.addEventListener('click', okBtnStartListener); 
		dialogForm.style.display = 'block';
		document.getElementById("my-ip-box").focus();
	});
		
}

function okBtnConnectListener(){
	 myIP = document.getElementById("my-ip-box").value;
	 myPort = parseInt(document.getElementById("my-port-box").value);
	 hostIP = document.getElementById("host-ip-box").value;
	 hostPort = parseInt(document.getElementById("host-port-box").value);
	 
	 if((myPort>=30005 && myPort<=30010) && (hostPort>=30005 && hostPort<=30010)){
	 	connect();
	 }
	 else{
	 	alert('Port number must be between 30005 and 30010');
	 	connectionDialog();
	 }
}

function okBtnStartListener(){
	 myIP = document.getElementById("my-ip-box").value;
	 myPort = parseInt(document.getElementById("my-port-box").value);

	if(myPort>=30005 && myPort<=30010){
	 	startListening();
	 }
	else{
		alert('Port number must be between 30005 and 30010');
		listenForConnectionDialog();
	 }
	
}



/*
** connect to specified host
*/
function connect(){

	dialogForm.style.display = 'none';
	connectBtn.innerHTML = 'Stop';
	connectBtn.onclick =  disconnect;
	listenForConnectionBtn.disabled = true;
	messageBox.focus();

	socket = dgram.createSocket('udp4');
	socket.bind(myPort, myIP, function(){
		stateLbl.innerHTML = 'Connecting to: ' + hostIP + ':' + hostPort;
		send(CODE.START_CONN_REQUEST);
	});

	socket.on('error', function(err) {
		socket.close();
		alert(err, 'Socket Error!');
		restoreBtns();
	});

	socket.on('message', receive);
}

function disconnect(){
	restoreBtns();
	if(timeoutID){
		clearTimeout(timeoutID.id);
		send(CODE.TERMINATE_CONN_REQUEST);
	}
	clearTimeout(acceptTimeout);
}

/*
** listening for connection
*/
function startListening(){
	dialogForm.style.display = 'none';
	listenForConnectionBtn.innerHTML = 'Stop';
	listenForConnectionBtn.onclick =  stopListening;
	connectBtn.disabled = true;
	messageBox.focus();
	
	// create UDP IPv4 socket
	socket = dgram.createSocket('udp4');
	socket.bind(myPort, myIP);

	socket.on('error', function(err) {
		socket.close();
		alert(err, 'Socket Error!');
		restoreBtns();
	});

	socket.on('listening', function () {
	    stateLbl.innerHTML = 'Waiting for connection on: ' + socket.address().address + ':' + socket.address().port;
	});

	socket.on('message', receive);
}

function stopListening(){
	restoreBtns();
	if(hostIP != undefined && hostPort != undefined)
		send(CODE.TERMINATE_CONN_REQUEST);			
	else
		stateLbl.innerHTML = '';
}

function terminateConnection(){
	clearTimeout(acceptTimeout);
	clearInterval(keepAliveTimer);
	restoreBtns();
	socket.close();
	stateLbl.innerHTML = '';
}

function refreshChat(address, port, message){
		chat = chat + address +':'+ port + ' - ' + message + '<br>';
		chatField.innerHTML = chat;
		chatField.scrollTop = chatField.scrollHeight;
		messageBox.value = '';
		messageBox.focus();
}

function refreshInfo(message){
		info = info + message + '<br>';
		infoField.innerHTML = info;
		infoField.scrollTop = infoField.scrollHeight;
}

/*
** Listeners for User input
*/
choosedFileBtn.addEventListener("click", function (e) {
	e.preventDefault();
    choosedFile = remote.dialog.showOpenDialog({properties: ['openFile']});
    if(choosedFile != undefined)
    	send(CODE.FILE);
});

cancelBtn.onclick = function(){
		dialogForm.style.display = 'none';
		connectBtn.focus();
	};

connectBtn.onclick = connectionDialog;
listenForConnectionBtn.onclick = listenForConnectionDialog;

sendBtn.addEventListener("click", function (e) {
    send(CODE.MESSAGE);
});

messageBox.addEventListener("keydown", function (e) {
    if (e.keyCode === 13) {  //checks for Enter key
        send(CODE.MESSAGE);
    }
});

// preventing submit on fragmentSizeBox
fragmentSizeBox.addEventListener("keydown", function (e) {
    if (e.keyCode === 13) {  //checks for Enter key
        e.preventDefault();
    }
});


function restoreBtns(){
	connectBtn.disabled = false;
	connectBtn.focus();
	connectBtn.innerHTML = 'Connect';
	connectBtn.onclick =  connectionDialog;

	listenForConnectionBtn.disabled = false;
	listenForConnectionBtn.innerHTML = 'Wait for connection';
	listenForConnectionBtn.onclick =  listenForConnectionDialog;
}
