'use client';

import { useState, useRef, useEffect } from 'react';
import { set, get, del, keys, getMany } from 'idb-keyval';

export default function VideoRecorderSpike() {
  const [isRecording, setIsRecording] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [videos, setVideos] = useState([]);
  const [status, setStatus] = useState('Ready');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const videoPreviewRef = useRef(null);

  // 1. Load saved videos on startup (Proof of Persistence)

  const loadSavedVideos = async () => {
    const allKeys = await keys();
    const videoKeys = allKeys.filter(k => k.startsWith('video_'));
    const videoData = await getMany(videoKeys);
    
    // Map keys to data for display
    const loaded = videoKeys.map((key, i) => ({
      id: key,
      ...videoData[i]
    }));
    setVideos(loaded);
  };

    useEffect(() => {
    setIsMounted(true);
    loadSavedVideos();
  }, []);

  if(!isMounted) {
    return <div>Loading recorder...</div>;
  }

  // 2. Determine correct MIME type (Critical for iOS vs Android)
  const getSupportedMimeType = () => {
    const types = [
      'video/mp4',             // Safari / iOS (preferred)
      'video/webkit',          // Older WebKit
      'video/webm;codecs=vp9', // Chrome High Quality
      'video/webm'             // Chrome Standard
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  };

  // 3. Start Recording
  const startRecording = async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, // Rear camera
        audio: true 
      });
      
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }

      const mimeType = getSupportedMimeType();
      if (!mimeType) throw new Error("No supported video mime type found");

      const recorder = new MediaRecorder(stream, { mimeType });
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const id = `video_${Date.now()}`;
        
        // SAVE LOCALLY FIRST (Persistence Layer)
        const videoRecord = {
          blob,
          timestamp: new Date().toISOString(),
          uploaded: false,
          mimeType
        };
        
        await set(id, videoRecord); // Saved to IndexedDB
        setStatus(`Saved to device! (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        
        // Stop camera stream
        stream.getTracks().forEach(track => track.stop());
        loadSavedVideos(); // Refresh list
      };

      recorder.start(1000); // Collect chunks every second
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatus('Recording...');
    } catch (err) {
      console.error(err);
      setStatus('Error accessing camera: ' + err.message);
    }
  };

  // 4. Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 5. Mock Upload with forced failure option
  const uploadVideo = async (id, forceFail = false) => {
    setStatus(`Attempting upload for ${id}...`);
    
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (forceFail) {
        throw new Error("Simulated Network Failure");
      }

      // If successful, update local status or delete
      // Real app: await fetch('/api/upload', { body: formData ... })
      
      const record = await get(id);
      if (record) {
        record.uploaded = true;
        await set(id, record); // Update DB state
      }
      
      setStatus('Upload Successful!');
      loadSavedVideos();
      
    } catch (err) {
      setStatus(`Upload FAILED: ${err.message}. Video is safe on device.`);
    }
  };

  // 6. Delete helper
  const deleteVideo = async (id) => {
    await del(id);
    loadSavedVideos();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Video Spike 🎥</h1>
      
      <div style={{ marginBottom: '20px', border: '1px solid #ccc', padding: '10px' }}>
        <video 
          ref={videoPreviewRef} 
          autoPlay 
          muted 
          playsInline 
          style={{ width: '100%', maxHeight: '300px', backgroundColor: '#000' }}
        />
        
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
          {!isRecording ? (
            <button 
              onClick={startRecording}
              style={{ padding: '10px 20px', background: 'red', color: 'white', border: 'none', borderRadius: '5px'}}
            >
              Start Recording
            </button>
          ) : (
            <button 
              onClick={stopRecording}
              style={{ padding: '10px 20px', background: 'black', color: 'white', border: 'none', borderRadius: '5px'}}
            >
              Stop & Save
            </button>
          )}
        </div>
        <p><strong>Status:</strong> {status}</p>
      </div>

      <h2>Saved on Device (IndexedDB)</h2>
      <p style={{ fontSize: '0.9rem', color: '#666' }}>
        These persist even if you close the tab or refresh.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {videos.map((v) => (
          <div key={v.id} style={{ padding: '10px', border: '1px solid #eee', borderRadius: '8px', background: v.uploaded ? '#eaffea' : '#fff0f0' }}>
            <div><strong>ID:</strong> {v.id.split('_')[1]}</div>
            <div><strong>Size:</strong> {(v.blob.size / 1024 / 1024).toFixed(2)} MB</div>
            <div><strong>Status:</strong> {v.uploaded ? 'Uploaded' : 'Pending Upload'}</div>
            
            <div style={{ marginTop: '10px', display: 'flex', gap: '5px' }}>
              {!v.uploaded && (
                <>
                  <button onClick={() => uploadVideo(v.id, false)}>Try Upload</button>
                  <button onClick={() => uploadVideo(v.id, true)}>Fail Upload</button>
                </>
              )}
              {v.uploaded && <button onClick={() => deleteVideo(v.id)}>Clear Local</button>}
              
              {/* Playback Local Blob */}
              <button onClick={() => {
                const url = URL.createObjectURL(v.blob);
                window.open(url, '_blank');
              }}>Play</button>
            </div>
          </div>
        ))}
        {videos.length === 0 && <p>No videos stored locally.</p>}
      </div>
    </div>
  );
}
