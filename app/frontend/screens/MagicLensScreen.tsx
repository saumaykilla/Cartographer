import React, { useState, useRef } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../context/AuthContext';
import { analyzeProductImage, ProductAnalysis } from '../lib/gemini';

export default function MagicLensScreen() {
  const { profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<ProductAnalysis | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <MaterialCommunityIcons name="camera-off" size={64} color="#94A3B8" />
          <Text style={styles.message}>We need your permission to show the camera</Text>
          <TouchableOpacity onPress={requestPermission} style={styles.permissionButton}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const analyzeProduct = async () => {
    if (!cameraRef.current) return;

    try {
      setIsAnalyzing(true);
      setResult(null);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      });

      if (!photo?.base64) {
        throw new Error("Failed to capture image");
      }

      setCapturedImage(photo.uri);

      // Call actual Gemini API
      const analysis = await analyzeProductImage(
        photo.base64,
        profile?.dietary_preferences || [],
        profile?.preferred_language || 'English'
      );

      setResult(analysis);
      setIsAnalyzing(false);

    } catch (error) {
      console.error("Analysis error:", error);
      setIsAnalyzing(false);
      // Fallback or error message could be added here
    }
  };

  const resetScanner = () => {
    setCapturedImage(null);
    setResult(null);
  };

  return (
    <View style={styles.container}>
      {!capturedImage ? (
        <CameraView style={styles.camera} ref={cameraRef} facing="back">
          <View style={styles.overlay}>
            <View style={styles.scanFrame} />
            <Text style={styles.overlayText}>Center the product label inside the frame</Text>
          </View>
        </CameraView>
      ) : (
        <View style={styles.previewContainer}>
          <Image source={{ uri: capturedImage }} style={styles.previewImage} />
          <TouchableOpacity style={styles.closeButton} onPress={resetScanner}>
            <MaterialCommunityIcons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
      
      <View style={[styles.controls, (result || isAnalyzing) && styles.controlsExpanded]}>
        {isAnalyzing && !result ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Analyzing product with AI...</Text>
          </View>
        ) : result ? (
          <ScrollView style={styles.resultScroll} showsVerticalScrollIndicator={false}>
            <View style={styles.resultHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle}>{result.productName}</Text>
                <Text style={styles.brandText}>{result.brand}</Text>
              </View>
              {result.isCommonInUS && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>US Staple</Text>
                </View>
              )}
            </View>
            
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What is it?</Text>
              <Text style={styles.resultText}>{result.description}</Text>
            </View>
            
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>How Americans use it</Text>
              <Text style={styles.resultText}>{result.howToUse}</Text>
            </View>
            
            {result.culturalContext && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cultural Equivalent</Text>
                <Text style={styles.resultText}>{result.culturalContext}</Text>
              </View>
            )}

            <View style={styles.dietaryCard}>
              <MaterialCommunityIcons name="shield-check" size={24} color="#059669" />
              <View style={styles.dietaryContent}>
                <Text style={styles.dietaryTitle}>Dietary & Health</Text>
                <Text style={styles.dietaryText}>{result.dietaryNote}</Text>
                <Text style={[styles.dietaryText, { marginTop: 4, fontWeight: '600' }]}>
                  {result.healthSignal}
                </Text>
              </View>
            </View>

            <TouchableOpacity style={styles.resetButton} onPress={resetScanner}>
              <Text style={styles.resetButtonText}>Scan Another Product</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <Text style={styles.title}>Magic Lens</Text>
            <Text style={styles.subtitle}>Scan any product to translate and check dietary compatibility.</Text>
            
            <TouchableOpacity 
              style={styles.scanButton} 
              onPress={analyzeProduct}
            >
              <MaterialCommunityIcons name="scan-helper" size={32} color="#fff" />
              <Text style={styles.scanButtonText}>Analyze Product</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 280,
    height: 280,
    borderWidth: 2,
    borderColor: '#3B82F6',
    borderRadius: 32,
    backgroundColor: 'transparent',
  },
  overlayText: {
    color: '#fff',
    marginTop: 24,
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
    fontWeight: '500',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8FAFC',
  },
  message: {
    textAlign: 'center',
    fontSize: 18,
    color: '#64748B',
    marginBottom: 24,
    marginTop: 16,
  },
  permissionButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  previewContainer: {
    flex: 1,
  },
  previewImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  closeButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748B',
  },
  controls: {
    backgroundColor: '#fff',
    padding: 24,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -32,
    minHeight: 180,
  },
  controlsExpanded: {
    height: '65%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1E293B',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    marginBottom: 24,
  },
  scanButton: {
    backgroundColor: '#3B82F6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginLeft: 12,
  },
  resultScroll: {
    flex: 1,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    marginBottom: 4,
  },
  brandText: {
    fontSize: 16,
    color: '#64748B',
    fontWeight: '500',
  },
  badge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 16,
    color: '#334155',
    lineHeight: 24,
  },
  dietaryCard: {
    backgroundColor: '#F0FDF4',
    padding: 20,
    borderRadius: 20,
    flexDirection: 'row',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  dietaryContent: {
    marginLeft: 16,
    flex: 1,
  },
  dietaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 6,
  },
  dietaryText: {
    fontSize: 14,
    color: '#166534',
    lineHeight: 20,
  },
  resetButton: {
    marginTop: 24,
    marginBottom: 40,
    alignItems: 'center',
    paddingVertical: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resetButtonText: {
    color: '#64748B',
    fontWeight: '600',
    fontSize: 16,
  },
});
