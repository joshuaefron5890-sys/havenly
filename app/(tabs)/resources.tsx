import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { ListRow } from '../../components/ListRow';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SectionHeader } from '../../components/SectionHeader';
import { useAuth } from '../../contexts/AuthContext';
import { fetchHealthResources, HealthResource, resourceSubtitle } from '../../lib/resources';
import { colors } from '../../theme/colors';

const PAGE_SIZE = 3;

// Only offers the toggle once there's actually more than PAGE_SIZE to show
// — no "View all" on a list that's already fully visible.
function expandAction(count: number, expanded: boolean, setExpanded: (v: boolean) => void) {
  if (count <= PAGE_SIZE) return {};
  return { action: expanded ? 'Show less' : 'View all', onAction: () => setExpanded(!expanded) };
}

export default function Resources() {
  const { user } = useAuth();
  const [resources, setResources] = useState<HealthResource[] | null>(null);
  const [resourcesError, setResourcesError] = useState<string | null>(null);
  const [resourcesExpanded, setResourcesExpanded] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchHealthResources()
      .then((result) => {
        if (!cancelled) setResources(result);
      })
      .catch((err: any) => {
        if (!cancelled) setResourcesError(err?.message ?? err?.code ?? 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader eyebrow="Haven.ly" title="Resources." />

      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader
          title="Articles & guides"
          {...expandAction(resources?.length ?? 0, resourcesExpanded, setResourcesExpanded)}
        />
        {resourcesError ? (
          <EmptyState text={`Couldn’t load articles (${resourcesError}).`} />
        ) : resources === null ? (
          <ActivityIndicator color={colors.accent} />
        ) : resources.length === 0 ? (
          <EmptyState text="Add your child's neurodivergence info to see relevant articles." />
        ) : (
          (resourcesExpanded ? resources : resources.slice(0, PAGE_SIZE)).map((resource) => (
            <ListRow
              key={resource.url}
              title={resource.title}
              subtitle={resourceSubtitle(resource)}
              onPress={() => Linking.openURL(resource.url)}
            />
          ))
        )}

        <SectionHeader title="Downloads for you" />
        <EmptyState text="No downloads yet." />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
});
