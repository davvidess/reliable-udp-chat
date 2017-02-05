/*
** datagram assembler
*/
function createDatagram(seqNum, ackNum, codeNum, payload){
	var header = Buffer.alloc(SIZE.HEADER);

	header.writeUInt16BE(seqNum, OFFSET.SEQ_NUM);
	header.writeUInt16BE(ackNum, OFFSET.ACK_NUM);
	header.writeUInt8(codeNum, OFFSET.CODE);
	
	// datagram with payload
	if(payload != undefined){
		var crc = crc32.unsigned(Buffer.concat([header.slice(OFFSET.SEQ_NUM, header.length), payload]));
		header.writeUInt32BE(crc, OFFSET.CRC);
		var datagram = Buffer.concat([header, payload]);
	}
	else{
		header = Buffer.concat([header, Buffer.alloc(SIZE.MIN_DATAGRAM - header.length)]);
		var crc = crc32.unsigned(header.slice(OFFSET.SEQ_NUM, header.length));
		header.writeUInt32BE(crc, OFFSET.CRC);
		var datagram = header;
	}

	return datagram;
}