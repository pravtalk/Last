import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward, Settings } from 'lucide-react';
import Hls from 'hls.js';

interface VideoPlayerProps {
  videoUrl: string;
  title: string;
  description?: string;
  duration?: number;
  isFree?: boolean;
  onNext?: () => void;
  onPrevious?: () => void;
  hasNext?: boolean;
  hasPrevious?: boolean;
}

// Define quality options
const QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1080', label: '1080p HD' },
  { value: '720', label: '720p HD' },
  { value: '480', label: '480p' },
  { value: '360', label: '360p' },
  { value: '240', label: '240p' }
];

const VideoPlayer = ({ 
  videoUrl, 
  title, 
  description, 
  duration, 
  isFree = false,
  onNext,
  onPrevious,
  hasNext = false,
  hasPrevious = false
}: VideoPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>('auto');
  const [availableQualities, setAvailableQualities] = useState<Array<{level: number, height: number, width: number, bitrate?: number}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Extract video ID from YouTube URL
  const getYouTubeVideoId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? match[2] : null;
  };

  // Extract video ID from Vimeo URL
  const getVimeoVideoId = (url: string) => {
    const regExp = /(?:vimeo)\.com.*(?:videos|video|channels|)\/([\d]+)/i;
    const match = url.match(regExp);
    return match ? match[1] : null;
  };

  // Check if URL is a direct video file
  const isDirectVideo = (url: string) => {
    return /\.(mp4|webm|ogg|mov|avi|wmv|flv|mkv)(\?.*)?$/i.test(url);
  };

  // Check if URL is an HLS stream
  const isHLSVideo = (url: string) => {
    return /\.m3u8(\?.*)?$/i.test(url);
  };

  // Generate quality-specific URLs for direct videos
  const getQualityUrl = (baseUrl: string, quality: string) => {
    if (quality === 'auto') return baseUrl;
    
    // Try to detect if the URL has quality indicators
    const urlParts = baseUrl.split('.');
    const extension = urlParts[urlParts.length - 1]?.split('?')[0];
    const baseUrlWithoutExt = baseUrl.replace(`.${extension}`, '');
    
    // Common patterns for quality URLs
    const qualityPatterns = [
      `${baseUrlWithoutExt}_${quality}p.${extension}`,
      `${baseUrlWithoutExt}-${quality}p.${extension}`,
      `${baseUrlWithoutExt}_${quality}.${extension}`,
      `${baseUrlWithoutExt}-${quality}.${extension}`
    ];
    
    // Return the first pattern (most common)
    return qualityPatterns[0];
  };

  const videoId = getYouTubeVideoId(videoUrl);
  const vimeoId = getVimeoVideoId(videoUrl);
  const isDirect = isDirectVideo(videoUrl);
  const isHLS = isHLSVideo(videoUrl);
  
  let embedUrl = videoUrl;
  let videoType = 'custom';
  
  if (videoId) {
    embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}&vq=${selectedQuality === 'auto' ? 'hd720' : selectedQuality}`;
    videoType = 'youtube';
  } else if (vimeoId) {
    embedUrl = `https://player.vimeo.com/video/${vimeoId}?quality=${selectedQuality === 'auto' ? '720p' : selectedQuality + 'p'}`;
    videoType = 'vimeo';
  } else if (isHLS) {
    videoType = 'hls';
  } else if (isDirect) {
    videoType = 'direct';
  }

  // Handle fullscreen functionality
  const toggleFullscreen = async () => {
    if (!videoContainerRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await videoContainerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Handle quality change for different video types
  const handleQualityChange = (quality: string) => {
    setSelectedQuality(quality);
    setIsLoading(true);

    if (videoType === 'hls' && hlsRef.current) {
      if (quality === 'auto') {
        hlsRef.current.currentLevel = -1; // Auto quality
      } else {
        // Find the best matching quality level
        const targetHeight = parseInt(quality);
        const bestMatch = availableQualities.find(q => q.height === targetHeight) || 
                         availableQualities.find(q => Math.abs(q.height - targetHeight) < 100);
        
        if (bestMatch) {
          hlsRef.current.currentLevel = bestMatch.level;
        }
      }
      setIsLoading(false);
    } else if (videoType === 'direct' && videoRef.current) {
      // For direct videos, try to load quality-specific URL
      const currentTime = videoRef.current.currentTime;
      const wasPlaying = !videoRef.current.paused;
      
      const qualityUrl = getQualityUrl(videoUrl, quality);
      videoRef.current.src = qualityUrl;
      
      // Restore playback position and state
      videoRef.current.addEventListener('loadedmetadata', () => {
        if (videoRef.current) {
          videoRef.current.currentTime = currentTime;
          if (wasPlaying) {
            videoRef.current.play().catch(console.error);
          }
        }
        setIsLoading(false);
      }, { once: true });
    } else {
      // For YouTube/Vimeo, the URL will be updated on next render
      setIsLoading(false);
    }
  };

  // Initialize HLS player
  useEffect(() => {
    if (videoType === 'hls' && videoRef.current && videoUrl) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600
        });
        
        hls.loadSource(videoUrl);
        hls.attachMedia(videoRef.current);
        
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLS manifest loaded');
          // Get available quality levels with more details
          const levels = hls.levels.map((level, index) => ({
            level: index,
            height: level.height,
            width: level.width,
            bitrate: level.bitrate
          })).sort((a, b) => b.height - a.height); // Sort by height descending
          
          setAvailableQualities(levels);
          setIsLoading(false);
        });
        
        hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          console.log('Quality level switched to:', data.level);
        });
        
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Fatal network error encountered, try to recover');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Fatal media error encountered, try to recover');
                hls.recoverMediaError();
                break;
              default:
                hls.destroy();
                break;
            }
          }
          setIsLoading(false);
        });
        
        hlsRef.current = hls;
        
        return () => {
          hls.destroy();
        };
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        videoRef.current.src = videoUrl;
        setIsLoading(false);
      }
    }
  }, [videoUrl, videoType]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  // Get available quality options based on video type
  const getAvailableQualityOptions = () => {
    const options = [{ value: 'auto', label: 'Auto' }];
    
    if (videoType === 'hls' && availableQualities.length > 0) {
      // Use actual available qualities from HLS stream
      availableQualities.forEach(quality => {
        const label = `${quality.height}p${quality.height >= 720 ? ' HD' : ''}`;
        options.push({ value: quality.level.toString(), label });
      });
    } else {
      // Use standard quality options, ensuring 720p and 480p are available
      const standardQualities = ['1080', '720', '480', '360', '240'];
      standardQualities.forEach(quality => {
        const height = parseInt(quality);
        const label = `${quality}p${height >= 720 ? ' HD' : ''}`;
        options.push({ value: quality, label });
      });
    }
    
    return options;
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="text-lg sm:text-xl line-clamp-2">{title}</CardTitle>
            {isFree && <Badge variant="secondary">Free Preview</Badge>}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video Container */}
          <div 
            ref={videoContainerRef}
            className={`relative aspect-video bg-black rounded-lg overflow-hidden group ${
              isFullscreen ? 'fixed inset-0 z-50 rounded-none' : ''
            }`}
          >
            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                <div className="text-white text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                  <p className="text-sm">Switching quality...</p>
                </div>
              </div>
            )}

            {/* Fullscreen Button */}
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70 text-white border-none"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </Button>

            {videoType === 'youtube' && videoId ? (
              <iframe
                key={selectedQuality} // Force re-render when quality changes
                src={embedUrl}
                title={title}
                className="w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : videoType === 'vimeo' && vimeoId ? (
              <iframe
                key={selectedQuality} // Force re-render when quality changes
                src={embedUrl}
                title={title}
                className="w-full h-full"
                frameBorder="0"
                allow="autoplay; fullscreen; picture-in-picture"
                allowFullScreen
              />
            ) : videoType === 'hls' ? (
              <video
                ref={videoRef}
                controls
                className="w-full h-full"
                poster=""
                preload="metadata"
                crossOrigin="anonymous"
              >
                Your browser does not support HLS video playback.
              </video>
            ) : videoType === 'direct' ? (
              <video
                ref={videoRef}
                controls
                className="w-full h-full"
                poster=""
                preload="metadata"
              >
                <source src={selectedQuality === 'auto' ? videoUrl : getQualityUrl(videoUrl, selectedQuality)} />
                Your browser does not support the video tag.
              </video>
            ) : videoUrl ? (
              // Fallback: try as iframe for other embedded content
              <iframe
                src={videoUrl}
                title={title}
                className="w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                onError={() => {
                  console.error('Failed to load video:', videoUrl);
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-white">
                  <Play className="h-16 w-16 mx-auto mb-4 opacity-70" />
                  <p className="text-lg">No video available</p>
                  <p className="text-sm opacity-70">Please check the video URL</p>
                </div>
              </div>
            )}
          </div>

          {/* Video Info */}
          <div className="text-center text-sm text-muted-foreground">
            {videoType === 'youtube' && <span>🎥 YouTube Video{selectedQuality !== 'auto' ? ` - ${selectedQuality}p` : ''}</span>}
            {videoType === 'vimeo' && <span>🎬 Vimeo Video{selectedQuality !== 'auto' ? ` - ${selectedQuality}p` : ''}</span>}
            {videoType === 'hls' && <span>📺 HLS Live Stream{selectedQuality !== 'auto' ? ` - Quality Level ${selectedQuality}` : ''}</span>}
            {videoType === 'direct' && <span>📹 Direct Video{selectedQuality !== 'auto' ? ` - ${selectedQuality}p` : ''}</span>}
            {videoType === 'custom' && videoUrl && <span>🔗 External Video Link</span>}
          </div>

          {/* Video Controls */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {duration && (
                <span className="text-sm text-muted-foreground">
                  Duration: {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, '0')} min
                </span>
              )}
              
              {/* Enhanced Quality Selector */}
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <Select value={selectedQuality} onValueChange={handleQualityChange}>
                  <SelectTrigger className="w-[140px] h-8">
                    <SelectValue placeholder="Quality" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableQualityOptions().map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasPrevious && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPrevious}
                  className="flex items-center gap-1"
                >
                  <SkipBack className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>
              )}
              
              {hasNext && (
                <Button
                  size="sm"
                  onClick={onNext}
                  className="flex items-center gap-1"
                >
                  <span className="hidden sm:inline">Next</span>
                  <SkipForward className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VideoPlayer;