import {
  createContext,
  forwardRef,
  useContext,
  useMemo,
  type ComponentRef,
} from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

export const PageGestureContext = createContext<ReturnType<
  typeof Gesture.Pan
> | null>(null);
const ScrollGestureContext = createContext<ReturnType<
  typeof Gesture.Native
> | null>(null);

export const GestureScrollView = forwardRef<
  ComponentRef<typeof ScrollView>,
  ScrollViewProps
>(function GestureScrollView(props, ref) {
  const page = useContext(PageGestureContext);
  const native = useMemo(() => {
    const gesture = Gesture.Native();
    if (page) gesture.simultaneousWithExternalGesture(page);
    return gesture;
  }, [page]);
  return (
    <ScrollGestureContext.Provider value={native}>
      <GestureDetector gesture={native}>
        <ScrollView {...props} ref={ref} />
      </GestureDetector>
    </ScrollGestureContext.Provider>
  );
});

export function useCardMotion(
  enabled: boolean,
  onStart: () => void,
  onRelease: (dx: number, dy: number) => void,
  onCancel: () => void,
) {
  const page = useContext(PageGestureContext);
  const scroll = useContext(ScrollGestureContext);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const axis = useSharedValue(0);
  const gesture = Gesture.Pan()
    .enabled(enabled)
    .minDistance(8)
    .maxPointers(1)
    .onStart(() => {
      cancelAnimation(x);
      cancelAnimation(y);
      axis.value = 0;
      runOnJS(onStart)();
    })
    .onUpdate((event) => {
      if (
        !axis.value &&
        Math.max(Math.abs(event.translationX), Math.abs(event.translationY)) >=
          16
      )
        axis.value =
          Math.abs(event.translationX) > Math.abs(event.translationY) * 1.5
            ? 1
            : 2;
      x.value = axis.value === 1 ? event.translationX : 0;
      y.value = axis.value === 2 ? event.translationY : 0;
    })
    .onEnd(() => {
      runOnJS(onRelease)(x.value, y.value);
    })
    .onFinalize((_, success) => {
      if (!success) runOnJS(onCancel)();
    });
  if (page) gesture.blocksExternalGesture(page);
  if (scroll) gesture.blocksExternalGesture(scroll);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  const reset = () => {
    x.value = withSpring(0, { damping: 20 });
    y.value = withSpring(0, { damping: 20 });
  };
  return { gesture, style, x, y, reset };
}
