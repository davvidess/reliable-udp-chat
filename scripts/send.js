/*
** function for sending datagrams
*/
function send(code, receivedSeqNum){
	var ackNum = 0;
	var seqNum = 0;
	var datagram;
	var fragSize = parseInt(fragmentSizeBox.value);
	var errorFragment = parseInt(errFragBox.value);
	var timesReSent = 0;
	var fragCount;

	if(receivedSeqNum != undefined)
		ackNum = receivedSeqNum;

	//decide what to do depending on code value
	switch(code) {
	    case CODE.MESSAGE:
	    	if(messageBox.value != '')
	    		var message = messageBox.value;
	    	else
	    		return;

			// calculate number of fragments
			fragCount = Math.floor(message.length/fragSize);
			if(message.length % fragSize > 0)
				fragCount++;	
			var i = 0;
			ackReceived = null;

			sendingLoop();

			function sendingLoop() {
				if(timesReSent === MAX_RESEND_ATTEMPTS-1){
					terminateConnection();
					return;
				}
				// if all framents were sent return
				if(i === fragCount)
					return;
				if(i===fragCount-1 && (message.length % fragSize) > 0){
					//posledny fragment
					var msgFrag = Buffer.from(message.substring(i*fragSize, i*fragSize + (message.length % fragSize)));
				}
				else{
					//ostatne fragmenty
					var msgFrag = Buffer.from(message.substring(i*fragSize, i*fragSize+fragSize));
				}
				seqNum = i;
				if(i === fragCount-1)
					code = CODE.END_OF_MESSAGE;

				datagram = createDatagram(seqNum, ackNum, code, msgFrag);

				if(i === errorFragment-1){	
					errorFragment = null;
					datagram.writeUInt8(0 ,OFFSET.PAYLOAD);
				}

				socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
					if (err) throw err;
					refreshInfo('Sending message fragment #' + (i+1) + '/' + fragCount);
				});

				// pridaj pocitadlo na resend only few times
				timeoutID = new ResendTimeout(function() {
					if(seqNum === ackReceived){
						i++;
						timesReSent = 0;
						sendingLoop();
					}
					else{
						sendingLoop();	
						timesReSent++;
					}
				}, RESEND_TIMEOUT);
			}

			refreshChat(myIP, myPort, message);
	        break;
	    case CODE.FILE:
	    	 var fileBuffer = fs.readFileSync(choosedFile[0]);

			// calculate number of fragments
	    	fragCount = Math.floor(fileBuffer.length/fragSize) + 1;
			if(fileBuffer.length % fragSize > 0)
				fragCount++;

			var i = 0;
			var leftOff = 0;
			var fileName = path.basename(choosedFile[0]);
			ackReceived = null;

			sendingFileLoop();

			function sendingFileLoop() {
				if(timesReSent === MAX_RESEND_ATTEMPTS){
					terminateConnection();
					return;
				}
				if(i === MAX_SEQUENCE_NUMBER+1){
					leftOff += (i-1)*fragSize;
					fragCount -= (i-1);
					i = 1;
				}
				// if all framents were sent return
				if(i === fragCount)
					return;
				if(i === 0){
					seqNum = i;
					var fileFrag = Buffer.from(fileName);
					datagram = createDatagram(seqNum, ackNum, code, fileFrag);

					if(i === errorFragment-1){	
						errorFragment = null;
						datagram.writeUInt8(0 ,OFFSET.PAYLOAD);
					}

					socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
						if (err) throw err;
						refreshChat(myIP, myPort, 'Sending file: ' + fileName);	
						refreshInfo('Sending file: ' + fileName + ' fragment #' + (i+1) + '/' + fragCount);
					});
				}
				else{
					if(i===fragCount-1 && (fileBuffer.length % fragSize) > 0){
						//posledny fragment
						var fileFrag = fileBuffer.slice(((i-1)*fragSize)+leftOff, ((i-1)*fragSize) + (fileBuffer.length % fragSize)+leftOff);
					}
					else{
						var fileFrag = fileBuffer.slice(((i-1)*fragSize)+leftOff, ((i-1)*fragSize)+fragSize+leftOff);
					}
					
					seqNum = i;
					if(i === fragCount-1)
						code = CODE.END_OF_FILE;

					datagram = createDatagram(seqNum, ackNum, code, fileFrag);

					if(i === errorFragment-1){	
						errorFragment = null;
						datagram.writeUInt8(0 ,OFFSET.PAYLOAD);
					}

					if(i === errorFragment){	
						errorFragment = null;
						datagram.writeUInt8(0 ,OFFSET.PAYLOAD);
					}

					socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
						if (err) throw err;
						refreshInfo('Sending file: ' + fileName + ' fragment #' + (i+1) + '/' + fragCount);
					});
				}

				timeoutID = new ResendTimeout(function() {
					if(seqNum === ackReceived){
						i++;
						timesReSent = 0;
						sendingFileLoop();
					}
					else{
						sendingFileLoop();
						timesReSent++;
					}
				}, RESEND_TIMEOUT);
			}
	        
	        break;
	    case CODE.START_CONN_ACCEPT:
	    case CODE.KEEP_CONN_ACCEPT:
	    case CODE.TERMINATE_CONN_ACCEPT:
			datagram = createDatagram(seqNum, ackNum, code, null);
			socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
				if (err) throw err;
			});
	        break;
	    case CODE.START_CONN_REQUEST:
	    case CODE.KEEP_CONN_REQUEST:
	    case CODE.TERMINATE_CONN_REQUEST:
	    	sendingRequestLoop();
	        break;
	    case CODE.ACK:
	    	datagram = createDatagram(seqNum, ackNum, code, null);
	    	socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
				if (err) throw err;
				refreshInfo('Sending ACK #' + (ackNum+1));
			});
	        break;
	    }

	

	function sendingRequestLoop() {
		if(timesReSent === MAX_RESEND_ATTEMPTS-1){
			terminateConnection();
			return;
		}

		datagram = createDatagram(seqNum, ackNum, code, null);

		if(i === errorFragment-1){	
			errorFragment = null;
			datagram.writeUInt8(0 ,OFFSET.PAYLOAD);
		}

		socket.send(datagram, 0, datagram.length, hostPort, hostIP, function(err, bytes) {
			if (err) throw err;
			switch(code){
				case CODE.START_CONN_REQUEST:
					var request = 'connection';
					break;
				case CODE.KEEP_CONN_REQUEST:
					var request = 'keeping connection';
					break;
				case CODE.TERMINATE_CONN_REQUEST:
					var request = 'terminating connection';
					break;
			}
			refreshInfo('Sending ' + request + ' request  ' + (timesReSent+1) + '.x');
		});

		// pridaj pocitadlo na resend only few times
		acceptTimeout = setTimeout(function() {
				sendingRequestLoop();	
				timesReSent++;
		}, RESEND_TIMEOUT);
	}		
}

