/*
** receiving function
*/
function receive(datagram, remote) {
	resetKeepAliveTimer();

	var receivedCrc = datagram.readUInt32BE(OFFSET.CRC);
	var seqNum = datagram.readUInt16BE(OFFSET.SEQ_NUM);
	var ackNum = datagram.readUInt16BE(OFFSET.ACK_NUM);
	var codeNum = datagram.readUInt8(OFFSET.CODE);
	var payload = datagram.toString('utf-8', OFFSET.PAYLOAD);

	var crc = crc32.unsigned(datagram.slice(OFFSET.SEQ_NUM, datagram.length));
	
	// CRC check
	if(crc === receivedCrc){
		switch(codeNum) {
	 		case CODE.MESSAGE:
	 		case CODE.END_OF_MESSAGE:
	 			// return if already received datagram with this Sequence Number
				if(lastSeqNum === seqNum)
					return;
				else if(seqNum === 0 || lastSeqNum+1 === seqNum){
					// start of new message => get new buffer
					if(seqNum === 0)
						currentBuffer = Buffer.alloc(0);

					// remember received Sequence Number
					lastSeqNum = seqNum;
					send(CODE.ACK, seqNum);

					// save received message
					addToCurrentBuffer(datagram.slice(OFFSET.PAYLOAD, datagram.length));

					// if end of message print it
					if(codeNum === CODE.END_OF_MESSAGE){
						lastSeqNum = null;
						refreshChat(remote.address, remote.port, currentBuffer.toString('utf-8'));
					}
					refreshInfo('Receiving message fragment #' + (seqNum+1));
				}
	 			break;
	 		case CODE.FILE:
	 		case CODE.END_OF_FILE:
	 			// return if already received datagram with this Sequence Number
				if(lastSeqNum === seqNum)
					return;
				else if(seqNum === 0 || lastSeqNum+1 === seqNum || 
					(lastSeqNum === MAX_SEQUENCE_NUMBER && seqNum === 1)){
					// start of file => get new buffer
					if(seqNum === 0){
						currentBuffer = Buffer.alloc(0);
						receivedFileName = payload.replace(/\0/g, '');
						refreshInfo('Receiving file: ' + receivedFileName + ' fragment #' + (seqNum+1));
					}
					else{
						// save received file
						addToCurrentBuffer(datagram.slice(OFFSET.PAYLOAD, datagram.length));
						refreshInfo('Receiving file: ' + receivedFileName + ' fragment #' + (seqNum+1));
					}
					// remember received Sequence Number
					lastSeqNum = seqNum;
					send(CODE.ACK, seqNum);

					if(codeNum === CODE.END_OF_FILE){
						lastSeqNum = null;
						//fs.writeFile('./received_files/' + receivedFileName, currentBuffer);
			 			fs.writeFile('../../../received_files/' + receivedFileName, currentBuffer);
			 			refreshChat(remote.address, remote.port, ': sent file ' + receivedFileName);		 				
			 		}
				}
				break;
	 		case CODE.START_CONN_REQUEST:
	 			hostIP = remote.address;
	 			hostPort = remote.port;
	 			stateLbl.innerHTML = 'Connected to ' + hostIP + ':' + hostPort;
	 			refreshInfo('Accepting connection request');
	 			send(CODE.START_CONN_ACCEPT);
	 			break;
	 		case CODE.START_CONN_ACCEPT:
	 			clearTimeout(acceptTimeout);
	 			stateLbl.innerHTML = 'Connected to ' + hostIP + ':' + hostPort;
	 			refreshInfo('Receiving connection acknowledgment');
	 			break;
	 		case CODE.KEEP_CONN_REQUEST:
	 			send(CODE.KEEP_CONN_ACCEPT);
	 			refreshInfo('Accepting connection keep alive request');
	 			break;
	 		case CODE.KEEP_CONN_ACCEPT:
	 			clearTimeout(acceptTimeout);
	 			refreshInfo('Receiving connection keep alive acknowledgment');
	 			break;
	 		case CODE.TERMINATE_CONN_REQUEST:
	 			send(CODE.TERMINATE_CONN_ACCEPT);
	 			setTimeout(terminateConnection, 800);
	 			refreshInfo('Accepting connection termination request');
	 			break;
	 		case CODE.TERMINATE_CONN_ACCEPT:
				terminateConnection();
				refreshInfo('Receiving connection termination acknowledgment');
	 			break;
	 		case CODE.ACK:
	 			refreshInfo('Receiving ACK #' + (ackNum+1));
				ackReceived = ackNum;
				timeoutID.clearAndFire();
	 			break;
			}	
		}
		else
			refreshInfo('Received damaged fragment #' + (seqNum+1));
}

function addToCurrentBuffer(buff){
	currentBuffer = Buffer.concat([currentBuffer, buff]);
}