'use client';

import { useState, useRef, useEffect } from 'react';
import { set, get, del, keys, getMany } from 'idb-keyval';

interface VideoRecord {
  id: string;
  blob: Blob;
  timestamp: string;
  uploaded: boolean;
  mimeType: string;
}


export default function VideoRecorderSpike() {
  const [isRecording, setIsRecording] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [videos, setVideos] = useState<VideoRecord[]>([]);
  const [status, setStatus] = useState('Ready');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const loadSavedVideos = async () => {
    const allKeys = await keys();
    const videoKeys = allKeys.filter((k): k is string => typeof k === 'string' && k.startsWith('video_'));
    const videoData = await getMany(videoKeys);
    
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

  const getSupportedMimeType = () => {
    const types = [
      'video/mp4',
      'video/webkit',
      'video/webm;codecs=vp9',
      'video/webm'
    ];
    return types.find(type => MediaRecorder.isTypeSupported(type)) || '';
  };

  const startRecording = async () => {
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
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
        
        const videoRecord = {
          blob,
          timestamp: new Date().toISOString(),
          uploaded: false,
          mimeType
        };
        
        await set(id, videoRecord);
        setStatus(`Saved to device! (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
        
        stream.getTracks().forEach(track => track.stop());
        loadSavedVideos();
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setStatus('Recording...');
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatus('Error accessing camera: ' + errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadVideo = async (id: string, forceFail = false) => {
    setStatus(`Attempting upload for ${id}...`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (forceFail) {
        throw new Error("Simulated Network Failure");
      }

      const record = await get(id);
      if (record) {
        record.uploaded = true;
        await set(id, record);
      }
      
      setStatus('Upload Successful!');
      loadSavedVideos();
      
    } catch (err) {
      console.error(err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setStatus(`Upload FAILED: ${errorMessage}. Video is safe on device.`);
    }
  };

  const deleteVideo = async (id: string) => {
    await del(id);
    loadSavedVideos();
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Persistence Video</h1>
      
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
