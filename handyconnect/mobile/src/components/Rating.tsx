import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RatingProps {
  value: number;
  count?: number;
}

const MAX_STARS = 5;

export const Rating: React.FC<RatingProps> = ({ value, count }) => {
  const filledStars = Math.round(value);

  return (
    <View style={styles.container}>
      <View style={styles.stars}>
        {Array.from({ length: MAX_STARS }).map((_, index) => (
          <Text key={index} style={index < filledStars ? styles.starFilled : styles.star}>
            ★
          </Text>
        ))}
      </View>
      {typeof count === 'number' && <Text style={styles.count}>({count})</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  stars: {
    flexDirection: 'row'
  },
  star: {
    color: '#d0d7de',
    marginRight: 2,
    fontSize: 14
  },
  starFilled: {
    color: '#f59e0b',
    marginRight: 2,
    fontSize: 14
  },
  count: {
    marginLeft: 4,
    color: '#4b5563',
    fontSize: 12
  }
});

export default Rating;
