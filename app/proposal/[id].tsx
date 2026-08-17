import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../components/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { showAlert } from '../../lib/alert';
import { familyDisplayName, fetchFamiliesByUids, SuggestedFamily } from '../../lib/families';
import { PlaydateProposal, respondToProposal, subscribeToProposal } from '../../lib/playdateProposals';
import { colors } from '../../theme/colors';

const STATUS_LABEL: Record<PlaydateProposal['status'], string> = {
  proposed: 'Waiting for a response',
  accepted: 'Accepted',
  declined: 'Declined',
};

export default function ProposalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [proposal, setProposal] = useState<PlaydateProposal | null | undefined>(undefined);
  const [family, setFamily] = useState<SuggestedFamily | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!id) return;
    return subscribeToProposal(id, setProposal);
  }, [id]);

  const otherUid = proposal && user ? (proposal.fromUid === user.uid ? proposal.toUid : proposal.fromUid) : undefined;

  useEffect(() => {
    if (!otherUid) return;
    let cancelled = false;
    fetchFamiliesByUids([otherUid]).then((result) => {
      if (!cancelled && result[0]) setFamily(result[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUid]);

  const respond = async (status: 'accepted' | 'declined') => {
    if (!id || responding) return;
    setResponding(true);
    try {
      await respondToProposal(id, status);
    } catch (err: any) {
      showAlert('Couldn’t save your response', err?.message ?? err?.code ?? 'Please try again.');
    } finally {
      setResponding(false);
    }
  };

  const proposeNewTime = () => {
    if (!otherUid) return;
    router.push(`/propose-playdate?familyId=${otherUid}`);
  };

  if (proposal === undefined) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  if (proposal === null) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <Pressable style={styles.backAlone} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.centered}>
          <EmptyState text="Couldn’t find that proposal." />
        </View>
      </SafeAreaView>
    );
  }

  const isRecipient = user?.uid === proposal.toUid;
  const canRespond = isRecipient && proposal.status === 'proposed';

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Playdate proposal</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subhead}>with {family ? familyDisplayName(family) : '…'}</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="calendar" size={18} color={colors.accent} />
            <Text style={styles.rowText}>{proposal.dateLabel}</Text>
          </View>
          <View style={styles.row}>
            <Ionicons name="location" size={18} color={colors.accent} />
            <Text style={styles.rowText}>{proposal.venue}</Text>
          </View>
          {proposal.note ? (
            <View style={styles.row}>
              <Ionicons name="chatbubble-ellipses" size={18} color={colors.accent} />
              <Text style={styles.rowText}>{proposal.note}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.statusPill, proposal.status !== 'proposed' && styles[`statusPill_${proposal.status}`]]}>
          <Text style={styles.statusPillText}>{STATUS_LABEL[proposal.status]}</Text>
        </View>
      </ScrollView>

      {canRespond ? (
        <View style={styles.footerStack}>
          <View style={styles.footer}>
            <Pressable
              style={[styles.declineButton, responding && styles.buttonDisabled]}
              onPress={() => respond('declined')}
              disabled={responding}
            >
              <Text style={styles.declineButtonText}>Decline</Text>
            </Pressable>
            <Pressable
              style={[styles.acceptButton, responding && styles.buttonDisabled]}
              onPress={() => respond('accepted')}
              disabled={responding}
            >
              <Text style={styles.acceptButtonText}>Accept</Text>
            </Pressable>
          </View>
          <Pressable style={styles.secondaryButton} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.footer}>
          <Pressable style={styles.secondaryButton} onPress={proposeNewTime}>
            <Text style={styles.secondaryButtonText}>Propose Update</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backAlone: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    padding: 20,
  },
  subhead: {
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  rowText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  statusPill_accepted: {
    backgroundColor: '#DCF3E4',
  },
  statusPill_declined: {
    backgroundColor: '#F5DCDC',
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
  },
  footerStack: {
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  acceptButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '700',
  },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  declineButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  secondaryButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
});
