import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, TextInput } from 'react-native';

interface RateProviderModalProps {
  visible: boolean;
  providerName: string;
  onClose: () => void;
  onSubmit: (payload: { rating: number; comment: string }) => void;
  submitting?: boolean;
}

const MAX_RATING = 5;

const RateProviderModal: React.FC<RateProviderModalProps> = ({
  visible,
  providerName,
  onClose,
  onSubmit,
  submitting = false,
}) => {
  const [rating, setRating] = useState<number>(MAX_RATING);
  const [comment, setComment] = useState<string>('');

  useEffect(() => {
    if (!visible) {
      setRating(MAX_RATING);
      setComment('');
    }
  }, [visible]);

  const stars = useMemo(() => Array.from({ length: MAX_RATING }, (_, index) => index + 1), []);

  const handleSubmit = () => {
    if (rating < 1) {
      return;
    }

    onSubmit({ rating, comment });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>Rate {providerName}</Text>
          <Text style={styles.subtitle}>Let others know how the job went.</Text>
          <View style={styles.ratingRow}>
            {stars.map((value) => (
              <Pressable
                key={value}
                onPress={() => setRating(value)}
                style={({ pressed }) => [styles.starButton, pressed && styles.starButtonPressed]}
              >
                <Text style={value <= rating ? styles.starFilled : styles.star}>★</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="Share your experience (optional)"
            multiline
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}>
              <Text style={styles.secondaryText}>Not now</Text>
            </Pressable>
            <Pressable
              onPress={handleSubmit}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.buttonPressed,
                submitting && styles.disabledButton,
              ]}
              disabled={submitting}
            >
              <Text style={styles.primaryText}>{submitting ? 'Sending...' : 'Submit review'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#ffffff',
    width: '100%',
    borderRadius: 16,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtitle: {
    color: '#475569',
    marginBottom: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  starButton: {
    padding: 8,
  },
  starButtonPressed: {
    opacity: 0.7,
  },
  star: {
    fontSize: 32,
    color: '#d0d7de',
  },
  starFilled: {
    fontSize: 32,
    color: '#f59e0b',
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
    color: '#0f172a',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    backgroundColor: '#1f6feb',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginLeft: 12,
  },
  primaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  secondaryText: {
    color: '#1f2937',
    fontWeight: '500',
  },
  buttonPressed: {
    opacity: 0.85,
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default RateProviderModal;
