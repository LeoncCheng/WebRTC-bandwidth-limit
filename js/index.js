'use strict';

let getMediaButton = document.querySelector('button#getMedia');
let connectButton = document.querySelector('button#connect');
let hangupButton = document.querySelector('button#hangup');

getMediaButton.onclick = getMedia;
connectButton.onclick = createPeerConnection;
hangupButton.onclick = hangup;

let bitrateDiv = document.querySelector('div#bitrate');
let peerDiv = document.querySelector('div#peer');
let senderStatsDiv = document.querySelector('div#senderStats');
let receiverStatsDiv = document.querySelector('div#receiverStats');

let localVideo = document.querySelector('div#localVideo video');
let remoteVideo = document.querySelector('div#remoteVideo video');
let localVideoStatsDiv = document.querySelector('div#localVideo div');
let remoteVideoStatsDiv = document.querySelector('div#remoteVideo div');

let localPeerConnection;
let remotePeerConnection;
let localStream;
let bytesPrev;
let timestampPrev;


/**
 * 是否修改sdp带宽值
 */
function bitrateChoose() {
    let bitrateSet = document.getElementById('bitrateSet')
    let bitrateList = document.getElementById('bitrateEnabled').options
    if(bitrateList && bitrateList.length > 0){
        let select= bitrateList[bitrateList.selectedIndex]
        if(select.value === 'true'){
            log.info('启用带宽设置')
            bitrateSet.style.display = 'block'
        }else {
            log.info('不启用带宽设置')
            bitrateSet.style.display = 'none'
        }
        log.warn("bitrate select: ", select.label)
    }else {
        alert('No device here! plug device and Try again!')
    }
}

function getResolution(value, constraints) {
    if(value){
        let res = parseInt(value)
        constraints.video = {}
        switch (res) {
            case 2160:
                constraints.video = {
                    width: {ideal: 3840, max: 3840},
                    height: {ideal: 2160, max: 2160}
                }
                break
            case 1080:
                constraints.video = {
                    width: {ideal: 1920, max: 1920},
                    height: {ideal: 1080, max: 1080}
                }
                break
            case 720:
                constraints.video = {
                    width: {ideal: 1280, max: 1280},
                    height: {ideal: 720, max: 720}
                }
                break
            case 480:
                constraints.video = {
                    width: {ideal: 848, max: 848},
                    height: {ideal: 480, max: 480}
                }
                break
            case 360:
                constraints.video = {
                    width: {ideal: 640, max: 640},
                    height: {ideal: 360, max: 360}
                }
                break
            case 272:
                constraints.video = {
                    width: {ideal: 480, max: 480},
                    height: {ideal: 272, max: 272}
                }
                break
            default:
                constraints = {audio: false, video: true}
                break
        }
    }else {
        log.warn("invalid value!!")
    }
}

function getMedia() {
    log.warn('GetUserMedia start!');
    getMediaButton.disabled = true;
    if (localStream) {
        localStream.getTracks().forEach(function(track) {
            track.stop();
        });
        let videoTracks = localStream.getVideoTracks();
        for (let i = 0; i !== videoTracks.length; ++i) {
            videoTracks[i].stop();
        }
    }

    let resolutionList = document.getElementById('setResolution').options
    let select= resolutionList[resolutionList.selectedIndex]
    log.warn("select Resolution: ", select.value)
    let constraints = {
        audio: false,
        video: true
    }
    getResolution(select.value, constraints)
    log.warn("getNewStream constraint: \n" + JSON.stringify(constraints, null, '    ') );

    navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(function(e) {
        log.warn("getUserMedia failed!");
        let message = 'getUserMedia error: ' + e.name + '\n' + 'PermissionDeniedError may mean invalid constraints.';
        log.warn(message);
        getMediaButton.disabled = false;
    });
}
getMedia();

function gotStream(stream) {
    connectButton.disabled = false;
    log.warn('GetUserMedia succeeded:');
    localStream = stream;
    localVideo.srcObject = stream;
}

function legalCheck() {
    let result = true
    let bitrateList = document.getElementById('bitrateEnabled').options
    let select= bitrateList[bitrateList.selectedIndex]
    if(select.value === 'true'){
        let ASBitrate = document.getElementById('ASBitrate').value

        if(isNaN(ASBitrate.trim())){
            log.warn('ASBitrate is required to be a number')
            result = false
        }
        if(ASBitrate.trim().length === 0 ){
            log.warn('至少设置ASBitrate或TIASBitrate')
            result = false
        }

    }
    return result
}

function createPeerConnection() {
    if(!legalCheck()){
        alert('请输入ASBitrate、TIASBitrate并确保为数字')
        return
    }

    log.info("begin create peerConnections");
    connectButton.disabled = true;
    hangupButton.disabled = false;

    bytesPrev = 0;
    timestampPrev = 0;
    localPeerConnection = new RTCPeerConnection(null);
    remotePeerConnection = new RTCPeerConnection(null);
    localStream.getTracks().forEach(
        function(track) {
            log.info("localPeerConnection addTack!");
            localPeerConnection.addTrack(
                track,
                localStream
            );
        }
    );
    log.info('localPeerConnection creating offer');
    localPeerConnection.onnegotiationeeded = function() {
        log.info('Negotiation needed - localPeerConnection');
    };
    remotePeerConnection.onnegotiationeeded = function() {
        log.info('Negotiation needed - remotePeerConnection');
    };
    localPeerConnection.onicecandidate = function(e) {
        log.info('Candidate localPeerConnection');
        remotePeerConnection.addIceCandidate(e.candidate)
            .then(
                onAddIceCandidateSuccess,
                onAddIceCandidateError
            );
    };
    remotePeerConnection.onicecandidate = function(e) {
        log.info('Candidate remotePeerConnection');
        localPeerConnection.addIceCandidate(e.candidate)
            .then(
                onAddIceCandidateSuccess,
                onAddIceCandidateError
            );
    };
    remotePeerConnection.ontrack = function(e) {
        if (remoteVideo.srcObject !== e.streams[0]) {
            log.info('remotePeerConnection got stream');
            remoteVideo.srcObject = e.streams[0];
        }
    };
    localPeerConnection.createOffer().then(
        function(offer) {
            log.info('localPeerConnection setLocalDescription:\n', offer.sdp);
            localPeerConnection.setLocalDescription(offer).then(function () {
                var sender = localPeerConnection.getSenders()[0]
                var videoParameters = sender.getParameters();
                var maxBitrate = document.getElementById('maxBitrate').value
                if(maxBitrate){
                    var encodingParameterList = {
                        active: true,             // 设置false后，这个编码就不生效
                        // degradationPreference: 'maintain-framerate',
                        priority: 'high',
                        networkPriority: "high",
                        maxBitrate: maxBitrate,
                        // maxFramerate: 15,
                    }
                    if(videoParameters.encodings && videoParameters.encodings.length){
                        videoParameters.encodings[0] = encodingParameterList;
                    }else {
                        videoParameters.encodings = []
                        videoParameters.encodings[0] = encodingParameterList;
                    }

                    console.warn("videoParameters: \n", JSON.stringify(videoParameters, null, '   '))
                    sender.setParameters(videoParameters).then(function () {
                        console.warn("setParameters set success!!!")
                    }).catch(function (error) {
                        console.error(error)
                    })
                }else {
                    console.warn("maxBitrate 不存在，不设置！！")
                }
            }).catch(function (error) {
                console.error(error)
            })

            log.info(`remotePeerConnection setRemoteDescription : \n${offer.sdp}`);
            remotePeerConnection.setRemoteDescription(offer).then(function () {
                log.info('remotePeerConnection setRemoteDescription success')
            }).catch(function (err) {
                log.error(err)
            })

            remotePeerConnection.createAnswer().then(
                function(answer) {
                    log.info('remotePeerConnection setLocalDescription: \n', answer.sdp);
                    remotePeerConnection.setLocalDescription(answer).then(function () {
                        log.info('setLocalDescription success')
                    }).catch(function (err) {
                        log.error(err)
                    })

                    let bitrateList = document.getElementById('bitrateEnabled').options
                    let select= bitrateList[bitrateList.selectedIndex]
                    console.log("select: ", select.value)
                    if(select.value === 'true'){
                        console.warn('bitrate is enabled')
                        answer.sdp = bitrateControl(answer.sdp);
                        answer.sdp = setProfileLevelId(answer.sdp)
                    }else {
                        console.warn('bitrate is disabled')
                    }

                    let parsedSdp = SDPTools.parseSDP(answer.sdp)
                    for(let i = 0; i < parsedSdp.media.length; i++){
                        let media = parsedSdp.media[i]
                        let codec = ['VP9','VP8']
                        console.warn("删除VP8、VP9编码")
                        SDPTools.removeCodecByName(parsedSdp, i, codec)

                        SDPTools.removeRembAndTransportCC(parsedSdp, i)
                        media.payloads = media.payloads.trim()
                    }
                    answer.sdp = SDPTools.writeSDP(parsedSdp)
                    answer.sdp = removeAllBitrateControl(answer.sdp);

                    log.warn(`localPeerConnection setRemoteDescription:\n${answer.sdp}`);
                    localPeerConnection.setRemoteDescription(answer).then(function () {
                        log.info('localPeerConnection setRemoteDescription success')
                    }).catch(function (err) {
                        log.error(err)
                    })
                },
                function(err) {
                    log.info(err);
                }
            );
        },
        function(err) {
            log.info(err);
        }
    );
}

function onAddIceCandidateSuccess() {
    log.info('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
    log.info('Failed to add Ice Candidate: ' + error.toString());
}


function hangup() {
    log.info('Ending call');
    localPeerConnection.close();
    remotePeerConnection.close();
    window.location.reload();

    // query stats one last time.
    Promise.all([
        remotePeerConnection.getStats(null)
            .then(showRemoteStats, function(err) {
                log.info(err);
            }),
        localPeerConnection.getStats(null)
            .then(showLocalStats, function(err) {
                log.info(err);
            })
    ]).then(() => {
        localPeerConnection = null;
        remotePeerConnection = null;
    });

    localStream.getTracks().forEach(function(track) {
        track.stop();
    });
    localStream = null;

    hangupButton.disabled = true;
    getMediaButton.disabled = false;
}

function showRemoteStats(results) {
    let statsString = dumpStats(results);

    receiverStatsDiv.innerHTML = '<h2>Receiver stats</h2>' + statsString;
    // calculate video bitrate
    results.forEach(function(report) {
        let now = report.timestamp;

        let bitrate;
        if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
            let bytes = report.bytesReceived;
            if (timestampPrev) {
                bitrate = 8 * (bytes - bytesPrev) / (now - timestampPrev);
                bitrate = Math.floor(bitrate);
            }
            bytesPrev = bytes;
            timestampPrev = now;
        }
        if (bitrate) {
            bitrate += ' kbits/sec';
            bitrateDiv.innerHTML = '<strong>Bitrate:</strong> ' + bitrate;
        }
    });

    // figure out the peer's ip
    let activeCandidatePair = null;
    let remoteCandidate = null;

    // Search for the candidate pair, spec-way first.
    results.forEach(function(report) {
        if (report.type === 'transport') {
            activeCandidatePair = results.get(report.selectedCandidatePairId);
        }
    });
    // Fallback for Firefox and Chrome legacy stats.
    if (!activeCandidatePair) {
        results.forEach(function(report) {
            if (report.type === 'candidate-pair' && report.selected ||
                report.type === 'googCandidatePair' &&
                report.googActiveConnection === 'true') {
                activeCandidatePair = report;
            }
        });
    }
    if (activeCandidatePair && activeCandidatePair.remoteCandidateId) {
        remoteCandidate = results.get(activeCandidatePair.remoteCandidateId);
    }
    if (remoteCandidate) {
        if (remoteCandidate.ip && remoteCandidate.port) {
            peerDiv.innerHTML = '<strong>Connected to:</strong> ' +
                remoteCandidate.ip + ':' + remoteCandidate.port;
        } else if (remoteCandidate.ipAddress && remoteCandidate.portNumber) {
            // Fall back to old names.
            peerDiv.innerHTML = '<strong>Connected to:</strong> ' +
                remoteCandidate.ipAddress +
                ':' + remoteCandidate.portNumber;
        }
    }
}

function showLocalStats(results) {
    let statsString = dumpStats(results);
    senderStatsDiv.innerHTML = '<h2>Sender stats</h2>' + statsString;
}
// Display statistics
setInterval(function() {
    if (localPeerConnection && remotePeerConnection) {
        remotePeerConnection.getStats(null)
            .then(showRemoteStats, function(err) {
                log.info(err);
            });
        localPeerConnection.getStats(null)
            .then(showLocalStats, function(err) {
                log.info(err);
            });
    } else {
        // log.info('Not connected yet');
    }
    // Collect some stats from the video tags.
    if (localVideo.videoWidth) {
        localVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            localVideo.videoWidth + 'x' + localVideo.videoHeight + 'px';
    }
    if (remoteVideo.videoWidth) {
        remoteVideoStatsDiv.innerHTML = '<strong>Video dimensions:</strong> ' +
            remoteVideo.videoWidth + 'x' + remoteVideo.videoHeight + 'px';
    }
}, 1000);

// Dumping a stats letiable as a string.
// might be named toString?
function dumpStats(results) {
    let statsString = '';
    results.forEach(function(res) {
        statsString += '<h3>Report type=';
        statsString += res.type;
        statsString += '</h3>\n';
        statsString += 'id ' + res.id + '<br>\n';
        statsString += 'time ' + res.timestamp + '<br>\n';
        Object.keys(res).forEach(function(k) {
            if (k !== 'timestamp' && k !== 'type' && k !== 'id') {
                statsString += k + ': ' + res[k] + '<br>\n';
            }
        });
    });
    return statsString;
}
